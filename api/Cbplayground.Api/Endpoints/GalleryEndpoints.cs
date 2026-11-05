using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The photo gallery of the signed-in Tenant Admin's restaurant: up to <see cref="GalleryPhoto.MaxPhotos"/> photos with optional
/// captions in a fixed order. Guests get it with the restaurant (<see cref="PublicRestaurantEndpoints"/>) and the images from
/// <c>/api/public/restaurants/{slug}/gallery/{id}</c>. Photos of another restaurant are 404 like unknown ones.
/// </summary>
public static class GalleryEndpoints
{
    public const long MaxPhotoBytes = 10 * 1024 * 1024;

    /// <summary>A photo of the gallery; <see cref="Caption"/> is null without caption.</summary>
    public record GalleryPhotoResponse(Guid Id, string Url, string? Caption);

    /// <summary>The caption is trimmed, an empty one is stored as null; longer than <see cref="GalleryPhoto.MaxCaptionLength"/> characters: 400 "invalid_caption".</summary>
    public record UpdateCaptionRequest(string? Caption);

    /// <summary>All photo ids of the gallery in their new order, each exactly once; otherwise 400 "invalid_order".</summary>
    public record ReorderGalleryRequest(List<Guid>? PhotoIds);

    public static void MapGalleryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/gallery").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (ITenantContext tenantContext, AppDbContext db) =>
            await ListAsync(db, await SlugAsync(db, tenantContext)));

        // Adds a photo at the end: the body is the image itself (PNG, JPEG or WebP, at most 10 MB), see ImageUploads.
        // The errors of the image are those of the cover image; a full gallery is 409 "gallery_full".
        group.MapPost("/", async (HttpRequest httpRequest, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            if (await db.GalleryPhotos.CountAsync(cancellationToken) >= GalleryPhoto.MaxPhotos)
            {
                return ErrorResponse.Result("gallery_full", StatusCodes.Status409Conflict);
            }

            var (fileName, error) = await ImageUploads.SaveAsync(httpRequest, MaxPhotoBytes, "floor_plan_too_large", configuration, environment, cancellationToken);
            if (error is not null)
            {
                return error;
            }

            var sortOrder = await db.GalleryPhotos.Select(p => (int?)p.SortOrder).MaxAsync(cancellationToken) is { } max ? max + 1 : 0;
            var photo = new GalleryPhoto { FileName = fileName!, SortOrder = sortOrder, CreatedAt = DateTime.UtcNow };
            db.GalleryPhotos.Add(photo);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Created($"/api/admin/gallery/{photo.Id}", ToResponse(photo, await SlugAsync(db, tenantContext)));
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateCaptionRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var photo = await db.GalleryPhotos.SingleOrDefaultAsync(p => p.Id == id);
            if (photo is null)
            {
                return Results.NotFound();
            }

            var caption = request.Caption?.Trim();
            if (caption?.Length > GalleryPhoto.MaxCaptionLength)
            {
                return ErrorResponse.Result("invalid_caption", StatusCodes.Status400BadRequest);
            }

            photo.Caption = string.IsNullOrEmpty(caption) ? null : caption;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(photo, await SlugAsync(db, tenantContext)));
        });

        // Deletes the photo and its file.
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var photo = await db.GalleryPhotos.SingleOrDefaultAsync(p => p.Id == id);
            if (photo is null)
            {
                return Results.NotFound();
            }

            db.GalleryPhotos.Remove(photo);
            await db.SaveChangesAsync();
            ImageUploads.Delete(configuration, environment, photo.FileName);
            return Results.NoContent();
        });

        group.MapPut("/order", async (ReorderGalleryRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var photos = await db.GalleryPhotos.ToListAsync();
            var photoIds = request.PhotoIds ?? [];
            if (photoIds.Count != photos.Count || photoIds.Distinct().Count() != photoIds.Count || photos.Any(p => !photoIds.Contains(p.Id)))
            {
                return ErrorResponse.Result("invalid_order", StatusCodes.Status400BadRequest);
            }

            foreach (var photo in photos)
            {
                photo.SortOrder = photoIds.IndexOf(photo.Id);
            }
            await db.SaveChangesAsync();
            var slug = await SlugAsync(db, tenantContext);
            return Results.Ok(photos.OrderBy(p => p.SortOrder).Select(p => ToResponse(p, slug)).ToList());
        });
    }

    /// <summary>The gallery of the current restaurant in its order.</summary>
    internal static async Task<List<GalleryPhotoResponse>> ListAsync(AppDbContext db, string slug) =>
        (await db.GalleryPhotos.OrderBy(p => p.SortOrder).ThenBy(p => p.CreatedAt).ToListAsync())
            .Select(p => ToResponse(p, slug))
            .ToList();

    /// <summary>The public URL of the photo, with its version (the file name, which is new for every upload), so it may be cached long.</summary>
    internal static string PhotoUrl(GalleryPhoto photo, string slug) =>
        $"/api/public/restaurants/{slug}/gallery/{photo.Id}?v={ImageUploads.Version(photo.FileName)}";

    private static GalleryPhotoResponse ToResponse(GalleryPhoto photo, string slug) => new(photo.Id, PhotoUrl(photo, slug), photo.Caption);

    private static Task<string> SlugAsync(AppDbContext db, ITenantContext tenantContext) =>
        db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.Slug).SingleAsync();
}
