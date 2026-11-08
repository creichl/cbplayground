using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.MenuEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The menu of a restaurant. Every test uses a restaurant of its own, so the tests do not see each other's menus.</summary>
public class MenuTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/menu";

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01];
    private static readonly byte[] Gif = [.. "GIF89a"u8, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<(TestRestaurant Restaurant, HttpClient Admin)> CreateRestaurantAsync()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, []);
        return (restaurant, await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail));
    }

    private static async Task<MenuSectionResponse> AddSectionAsync(HttpClient admin, string name = "Vorspeisen", string? description = null)
    {
        var response = await admin.PostAsJsonAsync($"{Path}/sections", new { name, description }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MenuSectionResponse>(Ct))!;
    }

    private static object Item(Guid sectionId, string name = "Schweinsbraten", object? price = null, string? description = null,
        string[]? allergens = null, bool vegetarian = false, bool recommended = false) =>
        new { sectionId, name, description, price, vegetarian, vegan = false, glutenFree = false, spicy = false, recommended, allergens = allergens ?? [] };

    private static async Task<MenuItemResponse> AddItemAsync(HttpClient admin, Guid sectionId, string name = "Schweinsbraten", int? price = 1690)
    {
        var response = await admin.PostAsJsonAsync($"{Path}/items", Item(sectionId, name, price), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!;
    }

    private static async Task<MenuResponse> MenuOf(HttpClient admin) => (await admin.GetFromJsonAsync<MenuResponse>(Path, Ct))!;

    private static async Task<HttpResponseMessage> UploadPhotoAsync(HttpClient admin, Guid itemId, byte[] content, string contentType = "image/jpeg")
    {
        var body = new ByteArrayContent(content);
        body.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return await admin.PutAsync($"{Path}/items/{itemId}/photo", body, Ct);
    }

    /// <summary>The path of the uploaded file behind the URL: its version is the file name without extension.</summary>
    private string FileOf(string url, string extension) => System.IO.Path.Combine(factory.UploadsPath, url.Split("?v=")[1] + extension);

    private static async Task<string?> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;

    private async Task SetCountryAsync(TestRestaurant restaurant, string? countryCode)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Tenants.Single(t => t.Id == restaurant.Id).CountryCode = countryCode;
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task A_new_restaurant_has_an_empty_menu()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        using var guest = factory.CreateHttpsClient();

        var menu = await MenuOf(admin);
        Assert.Equal("EUR", menu.Currency);
        Assert.Empty(menu.Sections);
        var publicMenu = (await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/restaurants/{restaurant.Slug}/menu", Ct))!;
        Assert.Empty(publicMenu.Sections);
    }

    [Fact]
    public async Task Sections_can_be_created_renamed_reordered_and_deleted()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var starters = await AddSectionAsync(admin, "  Vorspeisen  ", "  Zum Teilen  ");
        var mains = await AddSectionAsync(admin, "Hauptgerichte");
        var desserts = await AddSectionAsync(admin, "Desserts", "   ");

        Assert.Equal(("Vorspeisen", "Zum Teilen"), (starters.Name, starters.Description));
        Assert.Null(desserts.Description);
        Assert.Equal(["Vorspeisen", "Hauptgerichte", "Desserts"], (await MenuOf(admin)).Sections.Select(s => s.Name));

        var renamed = await admin.PutAsJsonAsync($"{Path}/sections/{mains.Id}", new { name = "Hauptspeisen", description = "Mit Beilage" }, Ct);
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        Assert.Equivalent(mains with { Name = "Hauptspeisen", Description = "Mit Beilage" }, await renamed.Content.ReadFromJsonAsync<MenuSectionResponse>(Ct), strict: true);

        var reordered = await admin.PutAsJsonAsync($"{Path}/sections/order", new { sectionIds = new[] { desserts.Id, starters.Id, mains.Id } }, Ct);
        Assert.Equal(HttpStatusCode.OK, reordered.StatusCode);
        Assert.Equal(["Desserts", "Vorspeisen", "Hauptspeisen"], (await reordered.Content.ReadFromJsonAsync<MenuResponse>(Ct))!.Sections.Select(s => s.Name));
        Assert.Equal(["Desserts", "Vorspeisen", "Hauptspeisen"], (await MenuOf(admin)).Sections.Select(s => s.Name));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{Path}/sections/{starters.Id}", Ct)).StatusCode);
        Assert.Equal(["Desserts", "Hauptspeisen"], (await MenuOf(admin)).Sections.Select(s => s.Name));
        // A new section comes last.
        await AddSectionAsync(admin, "Getränke");
        Assert.Equal(["Desserts", "Hauptspeisen", "Getränke"], (await MenuOf(admin)).Sections.Select(s => s.Name));
    }

    [Theory]
    [InlineData(null, null, "invalid_name")]
    [InlineData("   ", null, "invalid_name")]
    [InlineData("toolong", null, "invalid_name")]
    [InlineData("Vorspeisen", "toolong", "invalid_description")]
    public async Task An_invalid_section_is_rejected(string? name, string? description, string error)
    {
        var (_, admin) = await CreateRestaurantAsync();
        if (name == "toolong")
        {
            name = new string('a', MenuSection.MaxNameLength + 1);
        }
        if (description == "toolong")
        {
            description = new string('a', MenuSection.MaxDescriptionLength + 1);
        }
        var section = await AddSectionAsync(admin, "Suppen");

        var created = await admin.PostAsJsonAsync($"{Path}/sections", new { name, description }, Ct);
        var changed = await admin.PutAsJsonAsync($"{Path}/sections/{section.Id}", new { name, description }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);
        Assert.Equal(error, await ErrorOf(created));
        Assert.Equal(HttpStatusCode.BadRequest, changed.StatusCode);
        Assert.Equal(error, await ErrorOf(changed));
        Assert.Equivalent(new[] { section }, (await MenuOf(admin)).Sections, strict: true);
    }

    [Fact]
    public async Task Names_and_descriptions_may_have_their_full_length()
    {
        var (_, admin) = await CreateRestaurantAsync();

        var section = await AddSectionAsync(admin, new string('s', 60), new string('d', 200));
        var item = await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, new string('n', 100), description: new string('d', 300)), Ct);

        Assert.Equal(HttpStatusCode.Created, item.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, new string('n', 101)), Ct)).StatusCode);
        var tooLong = await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, description: new string('d', 301)), Ct);
        Assert.Equal("invalid_description", await ErrorOf(tooLong));
    }

    [Fact]
    public async Task Items_can_be_created_edited_reordered_moved_and_deleted()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var mains = await AddSectionAsync(admin, "Hauptgerichte");
        var desserts = await AddSectionAsync(admin, "Desserts");
        var roast = await AddItemAsync(admin, mains.Id, "Schweinsbraten");
        var schnitzel = await AddItemAsync(admin, mains.Id, "Schnitzel");
        var strudel = await AddItemAsync(admin, desserts.Id, "Apfelstrudel", 690);

        var edited = await admin.PutAsJsonAsync($"{Path}/items/{schnitzel.Id}", new
        {
            sectionId = mains.Id,
            name = "  Wiener Schnitzel  ",
            description = " Vom Kalb ",
            price = 2490,
            vegetarian = false,
            vegan = false,
            glutenFree = false,
            spicy = true,
            recommended = true,
            allergens = new[] { "Milk", "Gluten", "Eggs" },
        }, Ct);
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        var expected = schnitzel with
        {
            Name = "Wiener Schnitzel",
            Description = "Vom Kalb",
            Price = 2490,
            Spicy = true,
            Recommended = true,
            Allergens = [Allergen.Gluten, Allergen.Eggs, Allergen.Milk],
        };
        Assert.Equivalent(expected, await edited.Content.ReadFromJsonAsync<MenuItemResponse>(Ct), strict: true);

        var reordered = await admin.PutAsJsonAsync($"{Path}/sections/{mains.Id}/items/order", new { itemIds = new[] { schnitzel.Id, roast.Id } }, Ct);
        Assert.Equal(HttpStatusCode.OK, reordered.StatusCode);
        Assert.Equal(["Wiener Schnitzel", "Schweinsbraten"], (await reordered.Content.ReadFromJsonAsync<MenuSectionResponse>(Ct))!.Items.Select(i => i.Name));

        // Moving the roast to the desserts puts it last there.
        var moved = await admin.PutAsJsonAsync($"{Path}/items/{roast.Id}", Item(desserts.Id, "Schweinsbraten", 1690), Ct);
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var menu = await MenuOf(admin);
        Assert.Equal(["Wiener Schnitzel"], menu.Sections[0].Items.Select(i => i.Name));
        Assert.Equal(["Apfelstrudel", "Schweinsbraten"], menu.Sections[1].Items.Select(i => i.Name));
        Assert.Equal(desserts.Id, menu.Sections[1].Items[1].SectionId);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{Path}/items/{strudel.Id}", Ct)).StatusCode);
        Assert.Equal(["Schweinsbraten"], (await MenuOf(admin)).Sections[1].Items.Select(i => i.Name));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{Path}/items/{strudel.Id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task An_item_needs_a_section_of_the_restaurant()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var (_, otherAdmin) = await CreateRestaurantAsync();
        var foreign = await AddSectionAsync(otherAdmin);
        var section = await AddSectionAsync(admin);
        var item = await AddItemAsync(admin, section.Id);

        foreach (var sectionId in new[] { Guid.Empty, Guid.NewGuid(), foreign.Id })
        {
            var created = await admin.PostAsJsonAsync($"{Path}/items", Item(sectionId), Ct);
            var moved = await admin.PutAsJsonAsync($"{Path}/items/{item.Id}", Item(sectionId), Ct);
            Assert.Equal(HttpStatusCode.NotFound, created.StatusCode);
            Assert.Equal("section_not_found", await ErrorOf(created));
            Assert.Equal(HttpStatusCode.NotFound, moved.StatusCode);
            Assert.Equal("section_not_found", await ErrorOf(moved));
        }
        Assert.Equivalent(new[] { item }, (await MenuOf(admin)).Sections.Single().Items, strict: true);
        Assert.Empty((await MenuOf(otherAdmin)).Sections.Single().Items);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1490)]
    [InlineData(10_000_000)]
    public async Task The_price_is_a_whole_number_of_minor_units_up_to_10_000_000(int price)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);

        var item = await AddItemAsync(admin, section.Id, price: price);

        Assert.Equal(price, item.Price);
        Assert.Equal(price, (await MenuOf(admin)).Sections.Single().Items.Single().Price);
    }

    [Fact]
    public async Task An_item_without_price_has_none()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);
        var item = await AddItemAsync(admin, section.Id, price: 990);

        var response = await admin.PutAsJsonAsync($"{Path}/items/{item.Id}", Item(section.Id, price: null), Ct);

        Assert.Null((await response.Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.Price);
        Assert.Null((await MenuOf(admin)).Sections.Single().Items.Single().Price);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(10_000_001)]
    [InlineData(14.9)]
    [InlineData(1e12)]
    public async Task A_price_outside_the_range_or_with_a_fraction_of_a_minor_unit_is_rejected(double price)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);
        var item = await AddItemAsync(admin, section.Id, price: 990);

        var created = await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, price: price), Ct);
        var changed = await admin.PutAsJsonAsync($"{Path}/items/{item.Id}", Item(section.Id, price: price), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);
        Assert.Equal("invalid_price", await ErrorOf(created));
        Assert.Equal("invalid_price", await ErrorOf(changed));
        Assert.Equivalent(new[] { item }, (await MenuOf(admin)).Sections.Single().Items, strict: true);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public async Task An_item_needs_a_name(string? name)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);

        var response = await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, name!), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_name", await ErrorOf(response));
    }

    [Theory]
    [InlineData("Peanut")]
    [InlineData("milk")]
    [InlineData("")]
    public async Task An_unknown_allergen_is_rejected(string allergen)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);

        var response = await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, allergens: ["Gluten", allergen]), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_allergen", await ErrorOf(response));
        Assert.Empty((await MenuOf(admin)).Sections.Single().Items);
    }

    [Fact]
    public async Task All_14_EU_allergens_can_be_set_each_once()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);
        string[] all = ["Gluten", "Crustaceans", "Eggs", "Fish", "Peanuts", "Soy", "Milk", "Nuts", "Celery", "Mustard", "Sesame", "Sulphites", "Lupin", "Molluscs"];

        var response = await admin.PostAsJsonAsync($"{Path}/items", Item(section.Id, allergens: [.. all.Reverse(), "Milk"]), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(all, (await response.Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.Allergens.Select(a => a.ToString()));
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("twice")]
    [InlineData("unknown")]
    [InlineData("absent")]
    public async Task An_order_without_every_section_or_item_exactly_once_is_rejected(string kind)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var a = await AddSectionAsync(admin, "A");
        var b = await AddSectionAsync(admin, "B");
        var x = await AddItemAsync(admin, a.Id, "X");
        var y = await AddItemAsync(admin, a.Id, "Y");
        Guid[]? Ids(Guid first, Guid second) => kind switch
        {
            "missing" => [second],
            "twice" => [second, first, second],
            "unknown" => [second, first, Guid.NewGuid()],
            _ => null,
        };

        var sections = await admin.PutAsJsonAsync($"{Path}/sections/order", new { sectionIds = Ids(a.Id, b.Id) }, Ct);
        var items = await admin.PutAsJsonAsync($"{Path}/sections/{a.Id}/items/order", new { itemIds = Ids(x.Id, y.Id) }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, sections.StatusCode);
        Assert.Equal("invalid_order", await ErrorOf(sections));
        Assert.Equal(HttpStatusCode.BadRequest, items.StatusCode);
        Assert.Equal("invalid_order", await ErrorOf(items));
        var menu = await MenuOf(admin);
        Assert.Equal(["A", "B"], menu.Sections.Select(s => s.Name));
        Assert.Equal(["X", "Y"], menu.Sections[0].Items.Select(i => i.Name));
    }

    [Fact]
    public async Task The_menu_holds_at_most_20_sections()
    {
        var (_, admin) = await CreateRestaurantAsync();
        for (var i = 0; i < MenuSection.MaxSections; i++)
        {
            await AddSectionAsync(admin, $"Section {i}");
        }

        var response = await admin.PostAsJsonAsync($"{Path}/sections", new { name = "One more" }, Ct);

        Assert.Equal(20, MenuSection.MaxSections);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("menu_full", await ErrorOf(response));
        Assert.Equal(20, (await MenuOf(admin)).Sections.Count);
    }

    [Fact]
    public async Task The_menu_holds_at_most_300_items_over_all_sections()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var first = await AddSectionAsync(admin, "First");
        var second = await AddSectionAsync(admin, "Second");
        // 299 items directly, the last one through the API.
        using (var scope = factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.MenuItems.AddRange(Enumerable.Range(0, MenuItem.MaxItems - 1).Select(i => new MenuItem { SectionId = first.Id, Name = $"Dish {i}", SortOrder = i }));
            await db.SaveChangesAsync(Ct);
        }
        await AddItemAsync(admin, second.Id, "The 300th");

        var response = await admin.PostAsJsonAsync($"{Path}/items", Item(second.Id, "One more"), Ct);

        Assert.Equal(300, MenuItem.MaxItems);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("menu_full", await ErrorOf(response));
        Assert.Equal(300, (await MenuOf(admin)).Sections.Sum(s => s.Items.Count));
    }

    [Fact]
    public async Task A_photo_can_be_uploaded_replaced_and_deleted_with_its_file_and_guests_can_load_it()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);
        var item = await AddItemAsync(admin, section.Id);
        Assert.Null(item.PhotoUrl);

        var uploaded = await UploadPhotoAsync(admin, item.Id, Jpeg);
        Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode);
        var photoUrl = (await uploaded.Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.PhotoUrl!;
        Assert.StartsWith($"/api/public/restaurants/{restaurant.Slug}/menu/{item.Id}/photo?v=", photoUrl);
        Assert.True(File.Exists(FileOf(photoUrl, ".jpg")));
        using var guest = factory.CreateHttpsClient();
        var image = await guest.GetAsync(photoUrl, Ct);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/jpeg", image.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Jpeg, await image.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal(TimeSpan.FromDays(365), image.Headers.CacheControl?.MaxAge);
        Assert.True((await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/menu/{item.Id}/photo?v=old", Ct)).Headers.CacheControl?.NoCache);

        // Replacing deletes the old file.
        var replaced = await UploadPhotoAsync(admin, item.Id, Png, "image/png");
        var newUrl = (await replaced.Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.PhotoUrl!;
        Assert.NotEqual(photoUrl, newUrl);
        Assert.False(File.Exists(FileOf(photoUrl, ".jpg")));
        Assert.True(File.Exists(FileOf(newUrl, ".png")));

        var deleted = await admin.DeleteAsync($"{Path}/items/{item.Id}/photo", Ct);
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        Assert.Null((await deleted.Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.PhotoUrl);
        Assert.False(File.Exists(FileOf(newUrl, ".png")));
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(newUrl, Ct)).StatusCode);
    }

    [Fact]
    public async Task A_photo_must_be_a_png_jpeg_or_webp_of_at_most_10_MB()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);
        var item = await AddItemAsync(admin, section.Id);
        var tooLarge = new byte[MaxPhotoBytes + 1];
        Jpeg.CopyTo(tooLarge, 0);

        var gif = await UploadPhotoAsync(admin, item.Id, Gif, "image/gif");
        var large = await UploadPhotoAsync(admin, item.Id, tooLarge);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, gif.StatusCode);
        Assert.Equal("floor_plan_type_invalid", await ErrorOf(gif));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, large.StatusCode);
        Assert.Equal("floor_plan_too_large", await ErrorOf(large));
        Assert.Null((await MenuOf(admin)).Sections.Single().Items.Single().PhotoUrl);
    }

    [Fact]
    public async Task Deleting_an_item_or_a_section_deletes_the_photo_files_with_it()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin, "Hauptgerichte");
        var other = await AddSectionAsync(admin, "Desserts");
        var first = await AddItemAsync(admin, section.Id, "Schweinsbraten");
        var second = await AddItemAsync(admin, section.Id, "Schnitzel");
        var single = await AddItemAsync(admin, other.Id, "Strudel");
        async Task<string> Upload(MenuItemResponse item) =>
            (await (await UploadPhotoAsync(admin, item.Id, Jpeg)).Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.PhotoUrl!;
        var firstUrl = await Upload(first);
        var secondUrl = await Upload(second);
        var singleUrl = await Upload(single);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{Path}/items/{single.Id}", Ct)).StatusCode);
        Assert.False(File.Exists(FileOf(singleUrl, ".jpg")));
        Assert.True(File.Exists(FileOf(firstUrl, ".jpg")));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{Path}/sections/{section.Id}", Ct)).StatusCode);
        Assert.False(File.Exists(FileOf(firstUrl, ".jpg")));
        Assert.False(File.Exists(FileOf(secondUrl, ".jpg")));
        Assert.Equal(["Desserts"], (await MenuOf(admin)).Sections.Select(s => s.Name));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.False(await db.MenuItems.IgnoreQueryFilters().AnyAsync(i => i.Id == first.Id || i.Id == second.Id, Ct));
        }
    }

    [Fact]
    public async Task The_public_menu_leaves_out_empty_sections_and_keeps_the_order()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var starters = await AddSectionAsync(admin, "Vorspeisen", "Zum Teilen");
        await AddSectionAsync(admin, "Suppen");
        var desserts = await AddSectionAsync(admin, "Desserts");
        var obatzda = await AddItemAsync(admin, starters.Id, "Obatzda", 890);
        var salad = await AddItemAsync(admin, starters.Id, "Salat", null);
        var strudel = (await (await admin.PostAsJsonAsync($"{Path}/items",
            Item(desserts.Id, "Apfelstrudel", 690, "Mit Vanillesoße", ["Milk", "Gluten"], vegetarian: true, recommended: true), Ct))
            .Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!;
        (await admin.PutAsJsonAsync($"{Path}/sections/{starters.Id}/items/order", new { itemIds = new[] { salad.Id, obatzda.Id } }, Ct)).EnsureSuccessStatusCode();
        using var guest = factory.CreateHttpsClient();

        var menu = (await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/restaurants/{restaurant.Slug}/menu", Ct))!;

        Assert.Equal("EUR", menu.Currency);
        Assert.Equal(["Vorspeisen", "Desserts"], menu.Sections.Select(s => s.Name));
        Assert.Equal("Zum Teilen", menu.Sections[0].Description);
        Assert.Equal(["Salat", "Obatzda"], menu.Sections[0].Items.Select(i => i.Name));
        Assert.Null(menu.Sections[0].Items[0].Price);
        var item = Assert.Single(menu.Sections[1].Items);
        Assert.Equivalent(new PublicMenuItem(strudel.Id, "Apfelstrudel", "Mit Vanillesoße", 690, null, true, false, false, false, true, [Allergen.Gluten, Allergen.Milk]), item, strict: true);
    }

    [Theory]
    [InlineData(Locations.Germany, "EUR")]
    [InlineData(Locations.Austria, "EUR")]
    [InlineData(Locations.Serbia, "RSD")]
    public async Task The_currency_comes_from_the_restaurants_country(string countryCode, string currency)
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        await SetCountryAsync(restaurant, countryCode);
        using var guest = factory.CreateHttpsClient();

        Assert.Equal(currency, (await MenuOf(admin)).Currency);
        Assert.Equal(currency, (await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/restaurants/{restaurant.Slug}/menu", Ct))!.Currency);
    }

    [Fact]
    public async Task A_deactivated_or_unknown_restaurant_has_no_public_menu()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var section = await AddSectionAsync(admin);
        var item = await AddItemAsync(admin, section.Id);
        var photoUrl = (await (await UploadPhotoAsync(admin, item.Id, Jpeg)).Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.PhotoUrl!;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Tenants.Single(t => t.Id == restaurant.Id).IsActive = false;
            await db.SaveChangesAsync(Ct);
        }
        using var guest = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/menu", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(photoUrl, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync("/api/public/restaurants/no-such-restaurant/menu", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/no-such-restaurant/menu/{item.Id}/photo", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_restaurant_sees_and_changes_only_its_own_menu()
    {
        var (restaurantA, adminA) = await CreateRestaurantAsync();
        var (restaurantB, adminB) = await CreateRestaurantAsync();
        var sectionA = await AddSectionAsync(adminA, "A");
        var itemA = await AddItemAsync(adminA, sectionA.Id, "Dish A");
        var photoA = (await (await UploadPhotoAsync(adminA, itemA.Id, Jpeg)).Content.ReadFromJsonAsync<MenuItemResponse>(Ct))!.PhotoUrl!;
        var sectionB = await AddSectionAsync(adminB, "B");

        Assert.Equal(["B"], (await MenuOf(adminB)).Sections.Select(s => s.Name));
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PutAsJsonAsync($"{Path}/sections/{sectionA.Id}", new { name = "Taken" }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.DeleteAsync($"{Path}/sections/{sectionA.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PutAsJsonAsync($"{Path}/sections/{sectionA.Id}/items/order", new { itemIds = new[] { itemA.Id } }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PutAsJsonAsync($"{Path}/items/{itemA.Id}", Item(sectionB.Id), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.DeleteAsync($"{Path}/items/{itemA.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await UploadPhotoAsync(adminB, itemA.Id, Jpeg)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.DeleteAsync($"{Path}/items/{itemA.Id}/photo", Ct)).StatusCode);
        Assert.Equal("invalid_order", await ErrorOf(await adminB.PutAsJsonAsync($"{Path}/sections/order", new { sectionIds = new[] { sectionA.Id, sectionB.Id } }, Ct)));

        using var guest = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurantB.Slug}/menu/{itemA.Id}/photo", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(photoA, Ct)).StatusCode);
        var menuA = await MenuOf(adminA);
        Assert.Equal(["A"], menuA.Sections.Select(s => s.Name));
        Assert.Equal(["Dish A"], menuA.Sections[0].Items.Select(i => i.Name));
        Assert.Equal(["Dish A"], (await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/restaurants/{restaurantA.Slug}/menu", Ct))!.Sections.Single().Items.Select(i => i.Name));
        Assert.Empty((await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/restaurants/{restaurantB.Slug}/menu", Ct))!.Sections);
    }

    [Theory]
    [InlineData("GET", Path)]
    [InlineData("POST", Path + "/sections")]
    [InlineData("PUT", Path + "/sections/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", Path + "/sections/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", Path + "/sections/order")]
    [InlineData("PUT", Path + "/sections/00000000-0000-0000-0000-000000000001/items/order")]
    [InlineData("POST", Path + "/items")]
    [InlineData("PUT", Path + "/items/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", Path + "/items/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", Path + "/items/00000000-0000-0000-0000-000000000001/photo")]
    [InlineData("DELETE", Path + "/items/00000000-0000-0000-0000-000000000001/photo")]
    public async Task The_menu_is_managed_by_tenant_admins_only(string method, string path)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, []);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");
        HttpRequestMessage Request() => new(new HttpMethod(method), path)
        {
            Content = method switch
            {
                "PUT" when path.EndsWith("/photo") => new ByteArrayContent(Jpeg),
                "POST" or "PUT" => JsonContent.Create(new { name = "x", sectionIds = Array.Empty<Guid>(), itemIds = Array.Empty<Guid>() }),
                _ => null,
            },
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await superadmin.SendAsync(Request(), Ct)).StatusCode);
    }
}

/// <summary>The demo menus of the development seed, on a factory of their own: the seed changes the demo restaurants.</summary>
public class DemoMenuSeedTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task SeedAsync()
    {
        using var scope = factory.Services.CreateScope();
        await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
    }

    [Fact]
    public async Task The_seed_gives_each_demo_restaurant_its_menu_once()
    {
        await SeedAsync();
        await SeedAsync();

        using var guest = factory.CreateHttpsClient();
        foreach (var (slug, currency) in new[]
        {
            ("zur-linde", "EUR"), ("kafana-dunav", "RSD"), ("rooftop-belvedere", "EUR"),
            ("il-faro", "EUR"), ("cafe-morgenrot", "EUR"), ("izakaya-kaze", "RSD"),
        })
        {
            var menu = (await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/restaurants/{slug}/menu", Ct))!;
            var items = menu.Sections.SelectMany(s => s.Items).ToList();
            Assert.Equal(currency, menu.Currency);
            Assert.InRange(menu.Sections.Count, 4, 5);
            Assert.Equal(menu.Sections.Count, menu.Sections.Select(s => s.Name).Distinct().Count());
            Assert.InRange(items.Count, 18, 25);
            Assert.Equal(items.Count, items.Select(i => i.Name).Distinct().Count());
            Assert.InRange(items.Count(i => i.Recommended), 3, 4);
            Assert.InRange(items.Count(i => i.PhotoUrl is not null), 7, 10);
            Assert.NotEmpty(items.Where(i => i.Recommended && i.PhotoUrl is not null));
            Assert.All(items, i => Assert.InRange(i.Price ?? -1, 0, MenuItem.MaxPrice));
            Assert.Contains(items, i => i.Allergens.Count > 0);
            Assert.Contains(items, i => i.Vegetarian);
            foreach (var url in items.Select(i => i.PhotoUrl).OfType<string>())
            {
                var photo = await guest.GetAsync(url, Ct);
                Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
                Assert.Equal("image/jpeg", photo.Content.Headers.ContentType?.MediaType);
            }
        }
    }

    [Fact]
    public async Task The_seed_adds_the_menu_only_to_a_restaurant_without_menu_sections()
    {
        await SeedAsync();
        using var linde = await TestRestaurants.SignInAsync(factory, "admin@zur-linde.test");
        using var dunav = await TestRestaurants.SignInAsync(factory, "admin@kafana-dunav.test");
        // Linde keeps one section of its own; Dunav deletes its whole menu.
        var lindeMenu = (await linde.GetFromJsonAsync<MenuResponse>("/api/admin/menu", Ct))!;
        foreach (var section in lindeMenu.Sections.Skip(1))
        {
            (await linde.DeleteAsync($"/api/admin/menu/sections/{section.Id}", Ct)).EnsureSuccessStatusCode();
        }
        (await linde.PutAsJsonAsync($"/api/admin/menu/sections/{lindeMenu.Sections[0].Id}", new { name = "Unsere Brotzeit" }, Ct)).EnsureSuccessStatusCode();
        var dunavMenu = (await dunav.GetFromJsonAsync<MenuResponse>("/api/admin/menu", Ct))!;
        foreach (var section in dunavMenu.Sections)
        {
            (await dunav.DeleteAsync($"/api/admin/menu/sections/{section.Id}", Ct)).EnsureSuccessStatusCode();
        }

        await SeedAsync();

        Assert.Equal(["Unsere Brotzeit"], (await linde.GetFromJsonAsync<MenuResponse>("/api/admin/menu", Ct))!.Sections.Select(s => s.Name));
        var dunavAfter = (await dunav.GetFromJsonAsync<MenuResponse>("/api/admin/menu", Ct))!;
        Assert.Equal(dunavMenu.Sections.Select(s => s.Name), dunavAfter.Sections.Select(s => s.Name));
        Assert.Empty(dunavAfter.Sections.Select(s => s.Id).Intersect(dunavMenu.Sections.Select(s => s.Id)));
    }
}
