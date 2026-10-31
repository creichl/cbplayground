using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.FloorPlans;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Areas of a restaurant and their floor plans. Managing them is for Tenant Admins;
/// the floor plan images can be read by everybody, because guests will see them to pick a table.
/// </summary>
public static class AreaEndpoints
{
    public const int MaxNameLength = 100;
    public const long MaxFloorPlanBytes = 10 * 1024 * 1024;

    public record AreaResponse(Guid Id, string Name, int SortOrder, string? FloorPlanUrl, bool OnlineBookingEnabled, int OnlineCapacityPercent, int TableScale);

    public record CreateAreaRequest(string? Name);

    /// <summary>Without <see cref="TableScale"/> the stored value stays.</summary>
    public record UpdateAreaRequest(string? Name, bool OnlineBookingEnabled, int OnlineCapacityPercent, int? TableScale);

    /// <summary>All area ids of the restaurant in their new order.</summary>
    public record ReorderAreasRequest(List<Guid>? AreaIds);

    public static void MapAreaEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/areas").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (AppDbContext db) =>
            (await db.Areas.OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync()).Select(ToResponse));

        group.MapPost("/", async (CreateAreaRequest request, AppDbContext db) =>
        {
            var name = request.Name?.Trim();
            if (!IsValidName(name))
            {
                return ErrorResponse.Result("area_name_invalid", StatusCodes.Status400BadRequest);
            }

            var sortOrder = await db.Areas.Select(a => (int?)a.SortOrder).MaxAsync() is { } max ? max + 1 : 0;
            var area = new Area { Name = name!, SortOrder = sortOrder };
            db.Areas.Add(area);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/areas/{area.Id}", ToResponse(area));
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateAreaRequest request, AppDbContext db) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id);
            if (area is null)
            {
                return Results.NotFound();
            }

            var name = request.Name?.Trim();
            if (!IsValidName(name))
            {
                return ErrorResponse.Result("area_name_invalid", StatusCodes.Status400BadRequest);
            }
            if (request.OnlineCapacityPercent is < 0 or > 100)
            {
                return ErrorResponse.Result("online_capacity_percent_invalid", StatusCodes.Status400BadRequest);
            }
            if (request.TableScale is < 50 or > 200)
            {
                return ErrorResponse.Result("table_scale_invalid", StatusCodes.Status400BadRequest);
            }

            area.Name = name!;
            area.OnlineBookingEnabled = request.OnlineBookingEnabled;
            area.OnlineCapacityPercent = request.OnlineCapacityPercent;
            area.TableScale = request.TableScale ?? area.TableScale;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(area));
        });

        // Arranges all tables of the area anew (TableLayout), also in an area with floor plan image.
        group.MapPost("/{id:guid}/arrange-tables", async (Guid id, AppDbContext db) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id);
            if (area is null)
            {
                return Results.NotFound();
            }

            var tables = await db.Tables.Where(t => t.AreaId == id).ToListAsync();
            TableLayout.Arrange(tables, area.TableScale);
            await db.SaveChangesAsync();
            return Results.Ok(tables
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .Select(TableEndpoints.ToResponse));
        });

        // Deletes the area together with its tables (cascade) and its floor plan image. Not while one of its tables
        // has reservations that have not ended yet; the past, cancelled and declined ones are deleted with the tables.
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, IAvailabilityService availability, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id);
            if (area is null)
            {
                return Results.NotFound();
            }
            // The tables are loaded, so EF Core deletes the reservations before the tables and the tables before the area.
            var tables = await db.Tables.Where(t => t.AreaId == id).ToListAsync();
            if (!await TableDeletion.TryRemoveReservationsAsync(db, availability, tables.Select(t => t.Id).ToList()))
            {
                return ErrorResponse.Result("table_has_reservations", StatusCodes.Status409Conflict);
            }

            db.Tables.RemoveRange(tables);
            db.Areas.Remove(area);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            DeleteFloorPlanFile(configuration, environment, area.FloorPlanFileName);
            return Results.NoContent();
        });

        group.MapPut("/order", async (ReorderAreasRequest request, AppDbContext db) =>
        {
            var areas = await db.Areas.ToListAsync();
            var areaIds = request.AreaIds ?? [];
            if (areaIds.Count != areas.Count || areaIds.Distinct().Count() != areaIds.Count || areas.Any(a => !areaIds.Contains(a.Id)))
            {
                return ErrorResponse.Result("area_order_invalid", StatusCodes.Status400BadRequest);
            }

            foreach (var area in areas)
            {
                area.SortOrder = areaIds.IndexOf(area.Id);
            }
            await db.SaveChangesAsync();
            return Results.Ok(areas.OrderBy(a => a.SortOrder).Select(ToResponse));
        });

        // Uploads or replaces the floor plan. The body is the image itself (PNG, JPEG or WebP, at most 10 MB);
        // the type is detected from the content, the file name is chosen by the server.
        group.MapPut("/{id:guid}/floorplan", async (Guid id, HttpRequest httpRequest, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (area is null)
            {
                return Results.NotFound();
            }

            var tooLarge = ErrorResponse.Result("floor_plan_too_large", StatusCodes.Status413PayloadTooLarge);
            if (httpRequest.ContentLength > MaxFloorPlanBytes)
            {
                return tooLarge;
            }

            using var content = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await httpRequest.Body.ReadAsync(chunk, cancellationToken)) > 0)
            {
                content.Write(chunk, 0, read);
                if (content.Length > MaxFloorPlanBytes)
                {
                    return tooLarge;
                }
            }

            var extension = DetectImageExtension(content.GetBuffer().AsSpan(0, (int)content.Length));
            if (extension is null)
            {
                return ErrorResponse.Result("floor_plan_type_invalid", StatusCodes.Status415UnsupportedMediaType);
            }

            var directory = FloorPlanDirectory(configuration, environment);
            Directory.CreateDirectory(directory);
            var fileName = $"{Guid.NewGuid():N}{extension}";
            await File.WriteAllBytesAsync(Path.Combine(directory, fileName), content.ToArray(), cancellationToken);

            var previousFileName = area.FloorPlanFileName;
            area.FloorPlanFileName = fileName;
            await db.SaveChangesAsync(cancellationToken);
            DeleteFloorPlanFile(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(area));
        });

        app.MapGet("/api/areas/{id:guid}/floorplan", async (Guid id, HttpContext httpContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            // Public on purpose: guests have no tenant, so the tenant filter would hide every area.
            // Only the file name of the requested area is read.
            var fileName = await db.Areas.IgnoreQueryFilters()
                .Where(a => a.Id == id)
                .Select(a => a.FloorPlanFileName)
                .SingleOrDefaultAsync();
            if (fileName is null)
            {
                return Results.NotFound();
            }

            var path = Path.Combine(FloorPlanDirectory(configuration, environment), fileName);
            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            // The browser may cache the image but has to revalidate it, because a replaced floor plan keeps the URL.
            httpContext.Response.Headers.CacheControl = "no-cache";
            httpContext.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(path, ContentTypeOf(fileName));
        });
    }

    private static bool IsValidName(string? name) => !string.IsNullOrEmpty(name) && name.Length <= MaxNameLength;

    private static AreaResponse ToResponse(Area area) => new(
        area.Id,
        area.Name,
        area.SortOrder,
        FloorPlanUrl(area),
        area.OnlineBookingEnabled,
        area.OnlineCapacityPercent,
        area.TableScale);

    /// <summary>The public URL of the area's floor plan image; null without floor plan.</summary>
    internal static string? FloorPlanUrl(Area area) =>
        // The file name changes with every upload, so the query string tells the browser that the image is new.
        area.FloorPlanFileName is null ? null : $"/api/areas/{area.Id}/floorplan?v={Path.GetFileNameWithoutExtension(area.FloorPlanFileName)}";

    /// <summary>The folder of the uploaded images, "Uploads:Path" in the configuration, relative to the content root.</summary>
    internal static string FloorPlanDirectory(IConfiguration configuration, IWebHostEnvironment environment) =>
        Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuration["Uploads:Path"] ?? "data/uploads"));

    private static void DeleteFloorPlanFile(IConfiguration configuration, IWebHostEnvironment environment, string? fileName)
    {
        if (fileName is not null)
        {
            File.Delete(Path.Combine(FloorPlanDirectory(configuration, environment), fileName));
        }
    }

    /// <summary>The file extension for a PNG, JPEG or WebP image, detected from its first bytes; null for anything else.</summary>
    private static string? DetectImageExtension(ReadOnlySpan<byte> content)
    {
        if (content.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return ".png";
        }
        if (content.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]))
        {
            return ".jpg";
        }
        if (content.Length >= 12 && content[..4].SequenceEqual("RIFF"u8) && content[8..12].SequenceEqual("WEBP"u8))
        {
            return ".webp";
        }
        return null;
    }

    private static string ContentTypeOf(string fileName) => Path.GetExtension(fileName) switch
    {
        ".png" => "image/png",
        ".jpg" => "image/jpeg",
        ".webp" => "image/webp",
        _ => "application/octet-stream",
    };
}
