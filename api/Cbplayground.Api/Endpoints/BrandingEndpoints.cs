using System.Text.RegularExpressions;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The branding of the signed-in Tenant Admin's restaurant: accent colour, light or dark, font style, logo and cover image.
/// Guests get it with the restaurant (<see cref="PublicRestaurantEndpoints"/>) and the images from
/// <c>/api/public/restaurants/{slug}/logo</c> and <c>/cover</c>.
/// </summary>
public static partial class BrandingEndpoints
{
    public const long MaxLogoBytes = 2 * 1024 * 1024;
    public const long MaxCoverBytes = 10 * 1024 * 1024;

    /// <summary>
    /// The branding as the web uses it. <see cref="BrandColor"/> null: the platform's colour; without saved values
    /// <see cref="ThemeMode"/> is <c>Light</c> and <see cref="FontStyle"/> <c>Modern</c>; the URLs are null without image.
    /// </summary>
    public record BrandingResponse(string? BrandColor, ThemeMode ThemeMode, FontStyle FontStyle, string? LogoUrl, string? CoverUrl);

    /// <summary>
    /// The branding to save; empty values are stored as null (the platform's default). Errors (400): "invalid_brand_color"
    /// (not "#RRGGBB"), "invalid_theme_mode" (not "Light" or "Dark"), "invalid_font_style" (not "Modern", "Classic", "Elegant", "Rustic" or "Urban").
    /// </summary>
    public record BrandingRequest(string? BrandColor, string? ThemeMode, string? FontStyle);

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex BrandColorPattern();

    public static void MapBrandingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/branding").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (ITenantContext tenantContext, AppDbContext db) =>
            ToResponse(await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId)));

        group.MapPut("/", async (BrandingRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var brandColor = Normalize(request.BrandColor);
            if (brandColor is not null && !BrandColorPattern().IsMatch(brandColor))
            {
                return Error("invalid_brand_color");
            }
            if (!TryParse<ThemeMode>(request.ThemeMode, out var themeMode))
            {
                return Error("invalid_theme_mode");
            }
            if (!TryParse<FontStyle>(request.FontStyle, out var fontStyle))
            {
                return Error("invalid_font_style");
            }

            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            tenant.BrandColor = brandColor?.ToLowerInvariant();
            tenant.ThemeMode = themeMode;
            tenant.FontStyle = fontStyle;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(tenant));
        });

        // Uploads or replaces the logo: the body is the image itself (PNG, JPEG or WebP, at most 2 MB), see ImageUploads.
        group.MapPut("/logo", async (HttpRequest httpRequest, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var (fileName, error) = await ImageUploads.SaveAsync(httpRequest, MaxLogoBytes, "logo_too_large", configuration, environment, cancellationToken);
            if (error is not null)
            {
                return error;
            }

            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId, cancellationToken);
            var previousFileName = tenant.LogoFileName;
            tenant.LogoFileName = fileName;
            await db.SaveChangesAsync(cancellationToken);
            ImageUploads.Delete(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(tenant));
        });

        group.MapDelete("/logo", async (ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            var previousFileName = tenant.LogoFileName;
            tenant.LogoFileName = null;
            await db.SaveChangesAsync();
            ImageUploads.Delete(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(tenant));
        });

        // Uploads or replaces the cover image, like the logo but up to 10 MB (the limit and the code of the floor plans).
        group.MapPut("/cover", async (HttpRequest httpRequest, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var (fileName, error) = await ImageUploads.SaveAsync(httpRequest, MaxCoverBytes, "floor_plan_too_large", configuration, environment, cancellationToken);
            if (error is not null)
            {
                return error;
            }

            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId, cancellationToken);
            var previousFileName = tenant.CoverFileName;
            tenant.CoverFileName = fileName;
            await db.SaveChangesAsync(cancellationToken);
            ImageUploads.Delete(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(tenant));
        });

        group.MapDelete("/cover", async (ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            var previousFileName = tenant.CoverFileName;
            tenant.CoverFileName = null;
            await db.SaveChangesAsync();
            ImageUploads.Delete(configuration, environment, previousFileName);
            return Results.Ok(ToResponse(tenant));
        });
    }

    public static BrandingResponse ToResponse(Tenant tenant) => new(
        tenant.BrandColor,
        tenant.ThemeMode ?? ThemeMode.Light,
        tenant.FontStyle ?? FontStyle.Modern,
        LogoUrl(tenant),
        CoverUrl(tenant));

    /// <summary>The public URL of the logo, with its version, so a new logo gets a new URL; null without logo.</summary>
    public static string? LogoUrl(Tenant tenant) =>
        tenant.LogoFileName is null ? null : $"/api/public/restaurants/{tenant.Slug}/logo?v={ImageUploads.Version(tenant.LogoFileName)}";

    /// <summary>The public URL of the cover image, with its version; null without cover image.</summary>
    public static string? CoverUrl(Tenant tenant) =>
        tenant.CoverFileName is null ? null : $"/api/public/restaurants/{tenant.Slug}/cover?v={ImageUploads.Version(tenant.CoverFileName)}";

    /// <summary>Trimmed; an empty value is null.</summary>
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// An empty value is null (the default); otherwise it has to be the exact name of a value of the enum,
    /// so neither numbers nor other spellings are stored.
    /// </summary>
    private static bool TryParse<TEnum>(string? value, out TEnum? result) where TEnum : struct, Enum
    {
        result = null;
        var name = Normalize(value);
        if (name is null)
        {
            return true;
        }
        if (!Enum.GetNames<TEnum>().Contains(name))
        {
            return false;
        }
        result = Enum.Parse<TEnum>(name);
        return true;
    }

    private static IResult Error(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);
}
