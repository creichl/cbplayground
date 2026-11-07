using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The menu of a restaurant: up to <see cref="MenuSection.MaxSections"/> sections with up to <see cref="MenuItem.MaxItems"/> items
/// in all, each in a fixed order. Tenant Admins maintain the menu of their own restaurant under <c>/api/admin/menu</c>
/// (sections and items of another restaurant are 404 like unknown ones); guests read it, without empty sections, under
/// <c>/api/public/restaurants/{slug}/menu</c>. Prices are integers in minor units of the currency of the restaurant's country.
/// </summary>
public static class MenuEndpoints
{
    public const long MaxPhotoBytes = 10 * 1024 * 1024;

    /// <summary>An item of the menu as the admin edits it; <see cref="Price"/> in minor units, null without price; <see cref="PhotoUrl"/> null without photo.</summary>
    public record MenuItemResponse(Guid Id, Guid SectionId, string Name, string? Description, int? Price, string? PhotoUrl,
        bool Vegetarian, bool Vegan, bool GlutenFree, bool Spicy, bool Recommended, IReadOnlyList<Allergen> Allergens);

    /// <summary>A section with its items in their order.</summary>
    public record MenuSectionResponse(Guid Id, string Name, string? Description, IReadOnlyList<MenuItemResponse> Items);

    /// <summary>The whole menu for the admin: the currency of the prices ("EUR" or "RSD") and the sections in their order.</summary>
    public record MenuResponse(string Currency, IReadOnlyList<MenuSectionResponse> Sections);

    /// <summary>
    /// Creates or changes a section. Errors (400): "invalid_name" (empty after trimming or longer than <see cref="MenuSection.MaxNameLength"/>),
    /// "invalid_description" (longer than <see cref="MenuSection.MaxDescriptionLength"/>; an empty one is stored as null);
    /// (409) "menu_full" when a new section would be more than <see cref="MenuSection.MaxSections"/>.
    /// </summary>
    public record SectionRequest(string? Name, string? Description);

    /// <summary>
    /// Creates or changes an item; a new item and one moved to another <see cref="SectionId"/> come last in their section.
    /// <see cref="Price"/> in minor units, a whole number from 0 to <see cref="MenuItem.MaxPrice"/>, null without price.
    /// <see cref="Allergens"/> the names of <see cref="Allergen"/>, e.g. "Milk". Errors (400): "invalid_name", "invalid_description"
    /// (as for sections, with <see cref="MenuItem.MaxNameLength"/> and <see cref="MenuItem.MaxDescriptionLength"/>), "invalid_price",
    /// "invalid_allergen"; (404) "section_not_found" for an unknown section; (409) "menu_full" when a new item would be more than
    /// <see cref="MenuItem.MaxItems"/>.
    /// </summary>
    public record ItemRequest(Guid SectionId, string? Name, string? Description, decimal? Price,
        bool Vegetarian, bool Vegan, bool GlutenFree, bool Spicy, bool Recommended, List<string>? Allergens);

    /// <summary>All section ids of the menu in their new order, each exactly once; otherwise 400 "invalid_order".</summary>
    public record ReorderSectionsRequest(List<Guid>? SectionIds);

    /// <summary>All item ids of the section in their new order, each exactly once; otherwise 400 "invalid_order".</summary>
    public record ReorderItemsRequest(List<Guid>? ItemIds);

    /// <summary>An item of the public menu.</summary>
    public record PublicMenuItem(Guid Id, string Name, string? Description, int? Price, string? PhotoUrl,
        bool Vegetarian, bool Vegan, bool GlutenFree, bool Spicy, bool Recommended, IReadOnlyList<Allergen> Allergens);

    /// <summary>A section of the public menu, never empty.</summary>
    public record PublicMenuSection(string Name, string? Description, IReadOnlyList<PublicMenuItem> Items);

    /// <summary>The menu for guests: the currency of the prices and the sections with items in their order (empty without menu).</summary>
    public record PublicMenuResponse(string Currency, IReadOnlyList<PublicMenuSection> Sections);

    public static void MapMenuEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/menu").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (ITenantContext tenantContext, AppDbContext db) =>
        {
            var (slug, currency) = await RestaurantAsync(db, tenantContext);
            return new MenuResponse(currency, (await LoadAsync(db)).Select(s => ToResponse(s, slug)).ToList());
        });

        group.MapPost("/sections", async (SectionRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            if (await db.MenuSections.CountAsync() >= MenuSection.MaxSections)
            {
                return ErrorResponse.Result("menu_full", StatusCodes.Status409Conflict);
            }
            var section = new MenuSection { Name = "" };
            if (Apply(section, request) is { } error)
            {
                return error;
            }

            section.SortOrder = await db.MenuSections.Select(s => (int?)s.SortOrder).MaxAsync() is { } max ? max + 1 : 0;
            db.MenuSections.Add(section);
            await db.SaveChangesAsync();
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Created($"/api/admin/menu/sections/{section.Id}", ToResponse(section, slug));
        });

        group.MapPut("/sections/{id:guid}", async (Guid id, SectionRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var section = await db.MenuSections.Include(s => s.Items).SingleOrDefaultAsync(s => s.Id == id);
            if (section is null)
            {
                return Results.NotFound();
            }
            if (Apply(section, request) is { } error)
            {
                return error;
            }

            await db.SaveChangesAsync();
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Ok(ToResponse(section, slug));
        });

        // Deletes the section with its items and their photo files.
        group.MapDelete("/sections/{id:guid}", async (Guid id, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var section = await db.MenuSections.Include(s => s.Items).SingleOrDefaultAsync(s => s.Id == id);
            if (section is null)
            {
                return Results.NotFound();
            }

            var photoFiles = section.Items.Select(i => i.PhotoFileName).ToList();
            db.MenuItems.RemoveRange(section.Items);
            db.MenuSections.Remove(section);
            await db.SaveChangesAsync();
            foreach (var fileName in photoFiles)
            {
                ImageUploads.Delete(configuration, environment, fileName);
            }
            return Results.NoContent();
        });

        group.MapPut("/sections/order", async (ReorderSectionsRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var sections = await LoadAsync(db);
            var sectionIds = request.SectionIds ?? [];
            if (sectionIds.Count != sections.Count || sectionIds.Distinct().Count() != sectionIds.Count || sections.Any(s => !sectionIds.Contains(s.Id)))
            {
                return ErrorResponse.Result("invalid_order", StatusCodes.Status400BadRequest);
            }

            foreach (var section in sections)
            {
                section.SortOrder = sectionIds.IndexOf(section.Id);
            }
            await db.SaveChangesAsync();
            var (slug, currency) = await RestaurantAsync(db, tenantContext);
            return Results.Ok(new MenuResponse(currency, sections.OrderBy(s => s.SortOrder).Select(s => ToResponse(s, slug)).ToList()));
        });

        group.MapPut("/sections/{id:guid}/items/order", async (Guid id, ReorderItemsRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var section = await db.MenuSections.Include(s => s.Items).SingleOrDefaultAsync(s => s.Id == id);
            if (section is null)
            {
                return Results.NotFound();
            }
            var itemIds = request.ItemIds ?? [];
            if (itemIds.Count != section.Items.Count || itemIds.Distinct().Count() != itemIds.Count || section.Items.Any(i => !itemIds.Contains(i.Id)))
            {
                return ErrorResponse.Result("invalid_order", StatusCodes.Status400BadRequest);
            }

            foreach (var item in section.Items)
            {
                item.SortOrder = itemIds.IndexOf(item.Id);
            }
            await db.SaveChangesAsync();
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Ok(ToResponse(section, slug));
        });

        group.MapPost("/items", async (ItemRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            if (await db.MenuItems.CountAsync() >= MenuItem.MaxItems)
            {
                return ErrorResponse.Result("menu_full", StatusCodes.Status409Conflict);
            }
            var item = new MenuItem { Name = "" };
            if (await ApplyAsync(db, item, request) is { } error)
            {
                return error;
            }

            db.MenuItems.Add(item);
            await db.SaveChangesAsync();
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Created($"/api/admin/menu/items/{item.Id}", ToResponse(item, slug));
        });

        group.MapPut("/items/{id:guid}", async (Guid id, ItemRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var item = await db.MenuItems.SingleOrDefaultAsync(i => i.Id == id);
            if (item is null)
            {
                return Results.NotFound();
            }
            if (await ApplyAsync(db, item, request) is { } error)
            {
                return error;
            }

            await db.SaveChangesAsync();
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Ok(ToResponse(item, slug));
        });

        // Deletes the item and its photo file.
        group.MapDelete("/items/{id:guid}", async (Guid id, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var item = await db.MenuItems.SingleOrDefaultAsync(i => i.Id == id);
            if (item is null)
            {
                return Results.NotFound();
            }

            db.MenuItems.Remove(item);
            await db.SaveChangesAsync();
            ImageUploads.Delete(configuration, environment, item.PhotoFileName);
            return Results.NoContent();
        });

        // Uploads or replaces the photo of the item, like a gallery photo: PNG, JPEG or WebP, at most 10 MB (the codes of the floor plans).
        group.MapPut("/items/{id:guid}/photo", async (Guid id, HttpRequest httpRequest, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken cancellationToken) =>
        {
            var item = await db.MenuItems.SingleOrDefaultAsync(i => i.Id == id, cancellationToken);
            if (item is null)
            {
                return Results.NotFound();
            }

            var (fileName, error) = await ImageUploads.SaveAsync(httpRequest, MaxPhotoBytes, "floor_plan_too_large", configuration, environment, cancellationToken);
            if (error is not null)
            {
                return error;
            }

            var previousFileName = item.PhotoFileName;
            item.PhotoFileName = fileName;
            await db.SaveChangesAsync(cancellationToken);
            ImageUploads.Delete(configuration, environment, previousFileName);
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Ok(ToResponse(item, slug));
        });

        group.MapDelete("/items/{id:guid}/photo", async (Guid id, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var item = await db.MenuItems.SingleOrDefaultAsync(i => i.Id == id);
            if (item is null)
            {
                return Results.NotFound();
            }

            var previousFileName = item.PhotoFileName;
            item.PhotoFileName = null;
            await db.SaveChangesAsync();
            ImageUploads.Delete(configuration, environment, previousFileName);
            var (slug, _) = await RestaurantAsync(db, tenantContext);
            return Results.Ok(ToResponse(item, slug));
        });

        // The public menu, for an active restaurant only (the filter of the public restaurant endpoints).
        var publicGroup = app.MapGroup("/api/public/restaurants/{slug}/menu").AddEndpointFilter(PublicRestaurantEndpoints.RestaurantFromSlug);

        publicGroup.MapGet("/", async (ITenantContext tenantContext, AppDbContext db) =>
        {
            var (slug, currency) = await RestaurantAsync(db, tenantContext);
            var sections = (await LoadAsync(db))
                .Where(s => s.Items.Count > 0)
                .Select(s => new PublicMenuSection(s.Name, s.Description, s.Items.Select(i => new PublicMenuItem(
                    i.Id, i.Name, i.Description, i.Price, PhotoUrl(i, slug), i.Vegetarian, i.Vegan, i.GlutenFree, i.Spicy, i.Recommended, i.Allergens)).ToList()))
                .ToList();
            return new PublicMenuResponse(currency, sections);
        });

        // The photo of an item; one of another restaurant is not found, because the tenant filter hides it.
        publicGroup.MapGet("/{itemId:guid}/photo", async (Guid itemId, string? v, HttpContext httpContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var fileName = await db.MenuItems.Where(i => i.Id == itemId).Select(i => i.PhotoFileName).SingleOrDefaultAsync();
            return ImageUploads.Read(httpContext, configuration, environment, fileName, ImageUploads.CacheControl(fileName, v));
        });
    }

    /// <summary>The currency of the prices from the restaurant's country: RSD in Serbia, EUR in Germany, Austria and without a country.</summary>
    internal static string CurrencyOf(string? countryCode) => countryCode == Locations.Serbia ? "RSD" : "EUR";

    /// <summary>The public URL of the item's photo, with its version, so it may be cached long; null without photo.</summary>
    internal static string? PhotoUrl(MenuItem item, string slug) =>
        item.PhotoFileName is null ? null : $"/api/public/restaurants/{slug}/menu/{item.Id}/photo?v={ImageUploads.Version(item.PhotoFileName)}";

    /// <summary>The sections of the current restaurant with their items, both in their order.</summary>
    private static async Task<List<MenuSection>> LoadAsync(AppDbContext db)
    {
        var sections = await db.MenuSections.Include(s => s.Items).OrderBy(s => s.SortOrder).ToListAsync();
        foreach (var section in sections)
        {
            section.Items = section.Items.OrderBy(i => i.SortOrder).ToList();
        }
        return sections;
    }

    private static async Task<(string Slug, string Currency)> RestaurantAsync(AppDbContext db, ITenantContext tenantContext)
    {
        var tenant = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => new { t.Slug, t.CountryCode }).SingleAsync();
        return (tenant.Slug, CurrencyOf(tenant.CountryCode));
    }

    /// <summary>Checks the request and sets it on the section; the error, or null when valid.</summary>
    private static IResult? Apply(MenuSection section, SectionRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > MenuSection.MaxNameLength)
        {
            return Error("invalid_name");
        }
        var description = request.Description?.Trim();
        if (description?.Length > MenuSection.MaxDescriptionLength)
        {
            return Error("invalid_description");
        }

        section.Name = name;
        section.Description = string.IsNullOrEmpty(description) ? null : description;
        return null;
    }

    /// <summary>Checks the request and sets it on the item, moving it to the end of a new section; the error, or null when valid.</summary>
    private static async Task<IResult?> ApplyAsync(AppDbContext db, MenuItem item, ItemRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > MenuItem.MaxNameLength)
        {
            return Error("invalid_name");
        }
        var description = request.Description?.Trim();
        if (description?.Length > MenuItem.MaxDescriptionLength)
        {
            return Error("invalid_description");
        }
        if (request.Price is { } price && (price < 0 || price > MenuItem.MaxPrice || price != decimal.Truncate(price)))
        {
            return Error("invalid_price");
        }
        var allergenNames = request.Allergens ?? [];
        if (allergenNames.Any(a => !Enum.GetNames<Allergen>().Contains(a)))
        {
            return Error("invalid_allergen");
        }
        if (item.SectionId != request.SectionId || request.SectionId == Guid.Empty)
        {
            if (!await db.MenuSections.AnyAsync(s => s.Id == request.SectionId))
            {
                return ErrorResponse.Result("section_not_found", StatusCodes.Status404NotFound);
            }
            item.SectionId = request.SectionId;
            item.SortOrder = await db.MenuItems.Where(i => i.SectionId == request.SectionId).Select(i => (int?)i.SortOrder).MaxAsync() is { } max ? max + 1 : 0;
        }

        item.Name = name;
        item.Description = string.IsNullOrEmpty(description) ? null : description;
        item.Price = request.Price is { } value ? (int)value : null;
        item.Vegetarian = request.Vegetarian;
        item.Vegan = request.Vegan;
        item.GlutenFree = request.GlutenFree;
        item.Spicy = request.Spicy;
        item.Recommended = request.Recommended;
        item.Allergens = Enum.GetValues<Allergen>().Where(a => allergenNames.Contains(a.ToString())).ToList();
        return null;
    }

    private static MenuSectionResponse ToResponse(MenuSection section, string slug) =>
        new(section.Id, section.Name, section.Description, section.Items.OrderBy(i => i.SortOrder).Select(i => ToResponse(i, slug)).ToList());

    private static MenuItemResponse ToResponse(MenuItem item, string slug) =>
        new(item.Id, item.SectionId, item.Name, item.Description, item.Price, PhotoUrl(item, slug),
            item.Vegetarian, item.Vegan, item.GlutenFree, item.Spicy, item.Recommended, item.Allergens);

    private static IResult Error(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);
}
