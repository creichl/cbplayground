using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.BrandingEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The branding of a restaurant. Every test uses a restaurant of its own, so the tests do not see each other's branding.</summary>
public class BrandingTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/branding";

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01];
    private static readonly byte[] WebP = [.. "RIFF"u8, 0x24, 0x00, 0x00, 0x00, .. "WEBPVP8 "u8];
    private static readonly byte[] Gif = [.. "GIF89a"u8, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00];
    private static readonly byte[] Svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"5\"/></svg>"u8.ToArray();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<(TestRestaurant Restaurant, HttpClient Admin)> CreateRestaurantAsync()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, []);
        return (restaurant, await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail));
    }

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, string image, byte[] content, string contentType = "image/png")
    {
        var body = new ByteArrayContent(content);
        body.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return client.PutAsync($"{Path}/{image}", body, Ct);
    }

    private static async Task<BrandingResponse> UploadOkAsync(HttpClient client, string image, byte[] content, string contentType = "image/png")
    {
        var response = await UploadAsync(client, image, content, contentType);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BrandingResponse>(Ct))!;
    }

    private static string? UrlOf(BrandingResponse branding, string image) => image == "logo" ? branding.LogoUrl : branding.CoverUrl;

    /// <summary>The path of the uploaded file behind the URL: its version is the file name without extension.</summary>
    private string FileOf(string url, string extension) => System.IO.Path.Combine(factory.UploadsPath, url.Split("?v=")[1] + extension);

    private static async Task<string?> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;

    [Fact]
    public async Task A_restaurant_without_branding_gets_the_defaults()
    {
        var (_, admin) = await CreateRestaurantAsync();

        Assert.Equal(new BrandingResponse(null, ThemeMode.Light, FontStyle.Modern, null, null, TableStyle.Classic), await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct));
    }

    [Fact]
    public async Task A_saved_branding_is_returned_on_the_next_read_with_the_colour_in_lower_case()
    {
        var (_, admin) = await CreateRestaurantAsync();

        var put = await admin.PutAsJsonAsync(Path, new { brandColor = " #C9A96E ", themeMode = "Dark", fontStyle = "Elegant" }, Ct);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var expected = new BrandingResponse("#c9a96e", ThemeMode.Dark, FontStyle.Elegant, null, null, TableStyle.Classic);
        Assert.Equal(expected, await put.Content.ReadFromJsonAsync<BrandingResponse>(Ct));
        Assert.Equal(expected, await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct));
    }

    [Fact]
    public async Task Empty_values_are_stored_as_null_and_give_the_defaults()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban" }, Ct);

        var put = await admin.PutAsJsonAsync(Path, new { brandColor = "", themeMode = "", fontStyle = (string?)null }, Ct);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(new BrandingResponse(null, ThemeMode.Light, FontStyle.Modern, null, null, TableStyle.Classic), await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct));
        using var scope = factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<AppDbContext>().Tenants.Single(t => t.Id == restaurant.Id);
        Assert.Null(tenant.BrandColor);
        Assert.Null(tenant.ThemeMode);
        Assert.Null(tenant.FontStyle);
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#fff")]
    [InlineData("#12345g")]
    [InlineData("123456")]
    [InlineData("#1234567")]
    [InlineData("rgb(1,2,3)")]
    public async Task An_invalid_brand_color_is_rejected(string brandColor)
    {
        var (_, admin) = await CreateRestaurantAsync();

        var response = await admin.PutAsJsonAsync(Path, new { brandColor, themeMode = "Dark", fontStyle = "Classic" }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_brand_color", await ErrorOf(response));
    }

    [Theory]
    [InlineData("Purple")]
    [InlineData("1")]
    public async Task An_invalid_theme_mode_is_rejected(string themeMode)
    {
        var (_, admin) = await CreateRestaurantAsync();

        var response = await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode, fontStyle = "Classic" }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_theme_mode", await ErrorOf(response));
    }

    [Theory]
    [InlineData("Comic")]
    [InlineData("0")]
    public async Task An_invalid_font_style_is_rejected(string fontStyle)
    {
        var (_, admin) = await CreateRestaurantAsync();

        var response = await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_font_style", await ErrorOf(response));
    }

    [Theory]
    [InlineData("Classic", TableStyle.Classic)]
    [InlineData("Natural", TableStyle.Natural)]
    [InlineData("Minimal", TableStyle.Minimal)]
    [InlineData("Glow", TableStyle.Glow)]
    public async Task The_table_style_is_saved_and_given_to_the_guests(string tableStyle, TableStyle expected)
    {
        var (restaurant, admin) = await CreateRestaurantAsync();

        var put = await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban", tableStyle }, Ct);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(expected, (await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!.TableStyle);
        using var guest = factory.CreateClient();
        var publicRestaurant = await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct);
        Assert.Equal(expected, publicRestaurant!.Branding.TableStyle);
    }

    [Fact]
    public async Task Without_table_style_the_tables_look_classic()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban", tableStyle = "Glow" }, Ct);

        var put = await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban", tableStyle = "" }, Ct);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(TableStyle.Classic, (await put.Content.ReadFromJsonAsync<BrandingResponse>(Ct))!.TableStyle);
        using var scope = factory.Services.CreateScope();
        Assert.Null(scope.ServiceProvider.GetRequiredService<AppDbContext>().Tenants.Single(t => t.Id == restaurant.Id).TableStyle);
    }

    [Theory]
    [InlineData("Wood")]
    [InlineData("glow")]
    [InlineData("2")]
    public async Task An_invalid_table_style_is_rejected(string tableStyle)
    {
        var (_, admin) = await CreateRestaurantAsync();
        await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban", tableStyle = "Minimal" }, Ct);

        var response = await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban", tableStyle }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_table_style", await ErrorOf(response));
        Assert.Equal(TableStyle.Minimal, (await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!.TableStyle);
    }

    [Fact]
    public async Task A_rejected_save_changes_nothing()
    {
        var (_, admin) = await CreateRestaurantAsync();
        await admin.PutAsJsonAsync(Path, new { brandColor = "#123456", themeMode = "Dark", fontStyle = "Urban" }, Ct);

        var response = await admin.PutAsJsonAsync(Path, new { brandColor = "#654321", themeMode = "Light", fontStyle = "Comic" }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(new BrandingResponse("#123456", ThemeMode.Dark, FontStyle.Urban, null, null, TableStyle.Classic), await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct));
    }

    [Theory]
    [InlineData("logo", "png")]
    [InlineData("logo", "jpeg")]
    [InlineData("logo", "webp")]
    [InlineData("cover", "png")]
    [InlineData("cover", "jpeg")]
    [InlineData("cover", "webp")]
    public async Task An_image_can_be_uploaded_and_read_by_guests(string image, string type)
    {
        var (content, contentType) = type switch
        {
            "png" => (Png, "image/png"),
            "jpeg" => (Jpeg, "image/jpeg"),
            _ => (WebP, "image/webp"),
        };
        var (restaurant, admin) = await CreateRestaurantAsync();

        var branding = await UploadOkAsync(admin, image, content, contentType);

        var url = UrlOf(branding, image);
        Assert.NotNull(url);
        Assert.StartsWith($"/api/public/restaurants/{restaurant.Slug}/{image}?v=", url);
        Assert.Equal(url, UrlOf((await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!, image));

        using var guest = factory.CreateHttpsClient();
        var response = await guest.GetAsync(url, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(contentType, response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(content, await response.Content.ReadAsByteArrayAsync(Ct));
    }

    [Fact]
    public async Task An_image_with_its_current_version_may_be_cached_long_otherwise_it_is_revalidated()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var logoUrl = (await UploadOkAsync(admin, "logo", Png)).LogoUrl!;
        using var guest = factory.CreateHttpsClient();

        var current = await guest.GetAsync(logoUrl, Ct);
        var withoutVersion = await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/logo", Ct);
        var outdated = await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/logo?v=old", Ct);

        Assert.Equal(TimeSpan.FromDays(365), current.Headers.CacheControl?.MaxAge);
        Assert.True(withoutVersion.Headers.CacheControl?.NoCache);
        Assert.True(outdated.Headers.CacheControl?.NoCache);
        Assert.Equal(Png, await outdated.Content.ReadAsByteArrayAsync(Ct));
    }

    [Theory]
    [InlineData("logo")]
    [InlineData("cover")]
    public async Task A_new_image_replaces_the_old_file(string image)
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var first = UrlOf(await UploadOkAsync(admin, image, Png), image)!;

        var second = UrlOf(await UploadOkAsync(admin, image, Jpeg, "image/jpeg"), image)!;

        Assert.NotEqual(first, second);
        Assert.False(File.Exists(FileOf(first, ".png")));
        Assert.True(File.Exists(FileOf(second, ".jpg")));
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(Jpeg, await guest.GetByteArrayAsync($"/api/public/restaurants/{restaurant.Slug}/{image}", Ct));
    }

    [Theory]
    [InlineData("logo")]
    [InlineData("cover")]
    public async Task Deleting_an_image_removes_it_and_its_file(string image)
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var url = UrlOf(await UploadOkAsync(admin, image, Png), image)!;

        var response = await admin.DeleteAsync($"{Path}/{image}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(UrlOf((await response.Content.ReadFromJsonAsync<BrandingResponse>(Ct))!, image));
        Assert.Null(UrlOf((await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!, image));
        Assert.False(File.Exists(FileOf(url, ".png")));
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(url, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/{image}", Ct)).StatusCode);
        // Deleting again is fine.
        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync($"{Path}/{image}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Logo_and_cover_are_independent()
    {
        var (_, admin) = await CreateRestaurantAsync();
        await UploadOkAsync(admin, "logo", Png);
        var coverUrl = (await UploadOkAsync(admin, "cover", Jpeg, "image/jpeg")).CoverUrl!;

        await admin.DeleteAsync($"{Path}/logo", Ct);

        var branding = (await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!;
        Assert.Null(branding.LogoUrl);
        Assert.Equal(coverUrl, branding.CoverUrl);
        Assert.True(File.Exists(FileOf(coverUrl, ".jpg")));
    }

    [Theory]
    [InlineData("logo", "svg")]
    [InlineData("logo", "gif")]
    [InlineData("logo", "text")]
    [InlineData("logo", "empty")]
    [InlineData("cover", "svg")]
    [InlineData("cover", "gif")]
    [InlineData("cover", "text")]
    public async Task An_upload_checks_the_content_not_the_declared_type(string image, string type)
    {
        byte[] content = type switch
        {
            "svg" => Svg,
            "gif" => Gif,
            "text" => "Rooftop Belvedere"u8.ToArray(),
            _ => [],
        };
        var (_, admin) = await CreateRestaurantAsync();
        var filesBefore = Directory.Exists(factory.UploadsPath) ? Directory.GetFiles(factory.UploadsPath).Length : 0;

        var response = await UploadAsync(admin, image, content, type == "svg" ? "image/svg+xml" : "image/png");

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal("floor_plan_type_invalid", await ErrorOf(response));
        Assert.Null(UrlOf((await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!, image));
        Assert.Equal(filesBefore, Directory.Exists(factory.UploadsPath) ? Directory.GetFiles(factory.UploadsPath).Length : 0);
    }

    [Theory]
    [InlineData("logo", MaxLogoBytes, "logo_too_large")]
    [InlineData("cover", MaxCoverBytes, "floor_plan_too_large")]
    public async Task An_image_may_not_exceed_its_size_limit(string image, long maxBytes, string error)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var exactlyTheLimit = new byte[maxBytes];
        Png.CopyTo(exactlyTheLimit, 0);
        var tooLarge = new byte[maxBytes + 1];
        Png.CopyTo(tooLarge, 0);

        var rejected = await UploadAsync(admin, image, tooLarge);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, rejected.StatusCode);
        Assert.Equal(error, await ErrorOf(rejected));
        Assert.Null(UrlOf((await admin.GetFromJsonAsync<BrandingResponse>(Path, Ct))!, image));

        Assert.Equal(HttpStatusCode.OK, (await UploadAsync(admin, image, exactlyTheLimit)).StatusCode);
    }

    [Fact]
    public void The_logo_may_have_at_most_2_MB_and_the_cover_10_MB()
    {
        Assert.Equal(2 * 1024 * 1024, MaxLogoBytes);
        Assert.Equal(10 * 1024 * 1024, MaxCoverBytes);
    }

    [Fact]
    public async Task The_public_restaurant_and_the_restaurant_list_contain_the_branding()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        await admin.PutAsJsonAsync(Path, new { brandColor = "#c9a96e", themeMode = "Dark", fontStyle = "Elegant" }, Ct);
        await UploadOkAsync(admin, "logo", Png);
        var branding = await UploadOkAsync(admin, "cover", Jpeg, "image/jpeg");
        using var guest = factory.CreateHttpsClient();

        var publicRestaurant = await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct);
        var listItem = Assert.Single((await guest.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct))!, t => t.Slug == restaurant.Slug);

        Assert.Equal(branding, publicRestaurant!.Branding);
        Assert.Equal(new BrandingResponse("#c9a96e", ThemeMode.Dark, FontStyle.Elegant, branding.LogoUrl, branding.CoverUrl, TableStyle.Classic), branding);
        Assert.Equal((branding.LogoUrl, branding.CoverUrl, "#c9a96e"), (listItem.LogoUrl, listItem.CoverUrl, listItem.BrandColor));
    }

    [Fact]
    public async Task A_restaurant_without_branding_has_nulls_in_the_list_and_no_images()
    {
        var (restaurant, _) = await CreateRestaurantAsync();
        using var guest = factory.CreateHttpsClient();

        var listItem = Assert.Single((await guest.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct))!, t => t.Slug == restaurant.Slug);
        var publicRestaurant = await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct);

        Assert.Equal((null, null, null), (listItem.LogoUrl, listItem.CoverUrl, listItem.BrandColor));
        Assert.Equal(new BrandingResponse(null, ThemeMode.Light, FontStyle.Modern, null, null, TableStyle.Classic), publicRestaurant!.Branding);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/logo", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/cover", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync("/api/public/restaurants/no-such-restaurant/logo", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_deactivated_restaurant_shows_neither_branding_nor_images()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var logoUrl = (await UploadOkAsync(admin, "logo", Png)).LogoUrl!;
        var coverUrl = (await UploadOkAsync(admin, "cover", Png)).CoverUrl!;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Tenants.Single(t => t.Id == restaurant.Id).IsActive = false;
            await db.SaveChangesAsync(Ct);
        }
        using var guest = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(logoUrl, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(coverUrl, Ct)).StatusCode);
        Assert.DoesNotContain((await guest.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct))!, t => t.Slug == restaurant.Slug);
    }

    [Fact]
    public async Task An_admin_only_reads_and_changes_the_branding_of_their_own_restaurant()
    {
        var (restaurantA, adminA) = await CreateRestaurantAsync();
        var (restaurantB, adminB) = await CreateRestaurantAsync();
        await adminA.PutAsJsonAsync(Path, new { brandColor = "#c9a96e", themeMode = "Dark", fontStyle = "Elegant" }, Ct);
        await UploadOkAsync(adminA, "logo", Png);
        var brandingA = await UploadOkAsync(adminA, "cover", Png);

        // B reads only its own branding, and every change of B lands in B's restaurant.
        Assert.Equal(new BrandingResponse(null, ThemeMode.Light, FontStyle.Modern, null, null, TableStyle.Classic), await adminB.GetFromJsonAsync<BrandingResponse>(Path, Ct));
        await adminB.PutAsJsonAsync(Path, new { brandColor = "#000000", themeMode = "Light", fontStyle = "Urban" }, Ct);
        var logoB = (await UploadOkAsync(adminB, "logo", Jpeg, "image/jpeg")).LogoUrl!;
        Assert.Equal(HttpStatusCode.OK, (await adminB.DeleteAsync($"{Path}/cover", Ct)).StatusCode);

        Assert.Equal(brandingA, await adminA.GetFromJsonAsync<BrandingResponse>(Path, Ct));
        Assert.True(File.Exists(FileOf(brandingA.LogoUrl!, ".png")));
        Assert.True(File.Exists(FileOf(brandingA.CoverUrl!, ".png")));
        Assert.StartsWith($"/api/public/restaurants/{restaurantB.Slug}/logo", logoB);
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(Png, await guest.GetByteArrayAsync($"/api/public/restaurants/{restaurantA.Slug}/logo", Ct));
        Assert.Equal(Jpeg, await guest.GetByteArrayAsync($"/api/public/restaurants/{restaurantB.Slug}/logo", Ct));
    }

    [Theory]
    [InlineData("GET", Path)]
    [InlineData("PUT", Path)]
    [InlineData("PUT", Path + "/logo")]
    [InlineData("DELETE", Path + "/logo")]
    [InlineData("PUT", Path + "/cover")]
    [InlineData("DELETE", Path + "/cover")]
    public async Task The_branding_is_for_tenant_admins_only(string method, string path)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, []);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        HttpRequestMessage Request() => new(new HttpMethod(method), path)
        {
            Content = method != "PUT" ? null : path == Path ? JsonContent.Create(new { brandColor = "#123456" }) : new ByteArrayContent(Png),
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(Request(), Ct)).StatusCode);
    }
}
