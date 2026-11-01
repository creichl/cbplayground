using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.FloorPlans;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Areas of a restaurant with their floor plans, photos and descriptions. Managing them is for Tenant Admins;
/// the floor plan images and photos can be read by everybody, because guests will see them to pick a table.
/// </summary>
public static class AreaEndpoints
{
    public const int MaxNameLength = 100;
    public const long MaxFloorPlanBytes = 10 * 1024 * 1024;
    public const long MaxPhotoBytes = 10 * 1024 * 1024;

    /// <summary><see cref="Description"/> and the URLs are null when empty.</summary>
    public record AreaResponse(Guid Id, string Name, int SortOrder, string? FloorPlanUrl, string? Description, string? PhotoUrl, bool OnlineBookingEnabled, int OnlineCapacityPercent, int TableScale);

    public record CreateAreaRequest(string? Name);

    /// <summary>
    /// Without <see cref="TableScale"/> or <see cref="Description"/> the stored value stays. The description is trimmed, an empty one
    /// is stored as null; longer than <see cref="Area.MaxDescriptionLength"/> characters: 400 "invalid_area_description".
    /// </summary>
    public record UpdateAreaRequest(string? Name, bool OnlineBookingEnabled, int OnlineCapacityPercent, int? TableScale, string? Description);

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
            var description = request.Description?.Trim();
            if (description?.Length > Area.MaxDescriptionLength)
            {
                return ErrorResponse.Result("invalid_area_description", StatusCodes.Status400BadRequest);
            }

            area.Name = name!;
            area.OnlineBookingEnabled = request.OnlineBookingEnabled;
            area.OnlineCapacityPercent = request.OnlineCapacityPercent;
            area.TableScale = request.TableScale ?? area.TableScale;
            if (description is not null)
            {
                area.Description = description.Length == 0 ? null : description;
            }
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

        // Deletes the area together with its tables (cascade), its floor plan image and its photo. Not while one of its tables
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
            ImageUploads.Delete(configuration, environment, area.FloorPlanFileName);
            ImageUploads.Delete(configuration, environment, area.PhotoFileName);
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

        // Uploads or replaces the floor plan. The body is the image itself (PNG, JPEG or WebP, at most 10 MB), see ImageUploads.
        group.MapPut("/{id:guid}/floorplan", async (Guid id, HttpRequest httpRequest, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (area is null)
            {
                return Results.NotFound();
            }

            var (fileName, error) = await ImageUploads.SaveAsync(httpRequest, MaxFloorPlanBytes, "floor_plan_too_large", configuration, environment, cancellationToken);
            if (error is not null)
            {
                return error;
            }

            var previousFileName = area.FloorPlanFileName;
            area.FloorPlanFileName = fileName;
            await db.SaveChangesAsync(cancellationToken);
            ImageUploads.Delete(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(area));
        });

        // Uploads or replaces the photo of the area, like a cover image: PNG, JPEG or WebP, at most 10 MB (the code of the floor plans).
        group.MapPut("/{id:guid}/photo", async (Guid id, HttpRequest httpRequest, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (area is null)
            {
                return Results.NotFound();
            }

            var (fileName, error) = await ImageUploads.SaveAsync(httpRequest, MaxPhotoBytes, "floor_plan_too_large", configuration, environment, cancellationToken);
            if (error is not null)
            {
                return error;
            }

            var previousFileName = area.PhotoFileName;
            area.PhotoFileName = fileName;
            await db.SaveChangesAsync(cancellationToken);
            ImageUploads.Delete(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(area));
        });

        group.MapDelete("/{id:guid}/photo", async (Guid id, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == id);
            if (area is null)
            {
                return Results.NotFound();
            }

            var previousFileName = area.PhotoFileName;
            area.PhotoFileName = null;
            await db.SaveChangesAsync();
            ImageUploads.Delete(configuration, environment, previousFileName);
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
            // The browser may cache the image but has to revalidate it, because a replaced floor plan keeps the URL.
            return ImageUploads.Read(httpContext, configuration, environment, fileName, "no-cache");
        });

        app.MapGet("/api/areas/{id:guid}/photo", async (Guid id, string? v, HttpContext httpContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            // Public like the floor plan, for the same reason.
            var fileName = await db.Areas.IgnoreQueryFilters()
                .Where(a => a.Id == id)
                .Select(a => a.PhotoFileName)
                .SingleOrDefaultAsync();
            return ImageUploads.Read(httpContext, configuration, environment, fileName, ImageUploads.CacheControl(fileName, v));
        });
    }

    private static bool IsValidName(string? name) => !string.IsNullOrEmpty(name) && name.Length <= MaxNameLength;

    private static AreaResponse ToResponse(Area area) => new(
        area.Id,
        area.Name,
        area.SortOrder,
        FloorPlanUrl(area),
        area.Description,
        PhotoUrl(area),
        area.OnlineBookingEnabled,
        area.OnlineCapacityPercent,
        area.TableScale);

    /// <summary>The public URL of the area's floor plan image; null without floor plan.</summary>
    internal static string? FloorPlanUrl(Area area) =>
        // The file name changes with every upload, so the query string tells the browser that the image is new.
        area.FloorPlanFileName is null ? null : $"/api/areas/{area.Id}/floorplan?v={ImageUploads.Version(area.FloorPlanFileName)}";

    /// <summary>The public URL of the area's photo, with its version, so a new photo gets a new URL; null without photo.</summary>
    internal static string? PhotoUrl(Area area) =>
        area.PhotoFileName is null ? null : $"/api/areas/{area.Id}/photo?v={ImageUploads.Version(area.PhotoFileName)}";
}
