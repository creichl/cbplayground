using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.GalleryEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The photo gallery of a restaurant. Every test uses a restaurant of its own, so the tests do not see each other's photos.</summary>
public class GalleryTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/gallery";

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

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, byte[] content, string contentType = "image/jpeg")
    {
        var body = new ByteArrayContent(content);
        body.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return client.PostAsync(Path, body, Ct);
    }

    private static async Task<GalleryPhotoResponse> UploadOkAsync(HttpClient client, byte[]? content = null, string contentType = "image/jpeg")
    {
        var response = await UploadAsync(client, content ?? Jpeg, contentType);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<GalleryPhotoResponse>(Ct))!;
    }

    private static async Task<List<GalleryPhotoResponse>> GalleryOf(HttpClient admin) =>
        (await admin.GetFromJsonAsync<List<GalleryPhotoResponse>>(Path, Ct))!;

    /// <summary>The path of the uploaded file behind the URL: its version is the file name without extension.</summary>
    private string FileOf(string url, string extension) => System.IO.Path.Combine(factory.UploadsPath, url.Split("?v=")[1] + extension);

    private int UploadedFileCount() => Directory.Exists(factory.UploadsPath) ? Directory.GetFiles(factory.UploadsPath).Length : 0;

    private static async Task<string?> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;

    [Fact]
    public async Task A_restaurant_without_photos_has_an_empty_gallery()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        using var guest = factory.CreateHttpsClient();

        Assert.Empty(await GalleryOf(admin));
        var publicRestaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct))!;
        Assert.Empty(publicRestaurant.Gallery);
    }

    [Theory]
    [InlineData("png")]
    [InlineData("jpeg")]
    [InlineData("webp")]
    public async Task A_photo_can_be_uploaded_and_read_by_guests(string type)
    {
        var (content, contentType) = type switch
        {
            "png" => (Png, "image/png"),
            "jpeg" => (Jpeg, "image/jpeg"),
            _ => (WebP, "image/webp"),
        };
        var (restaurant, admin) = await CreateRestaurantAsync();

        var response = await UploadAsync(admin, content, contentType);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var photo = (await response.Content.ReadFromJsonAsync<GalleryPhotoResponse>(Ct))!;
        Assert.Equal($"/api/admin/gallery/{photo.Id}", response.Headers.Location?.OriginalString);
        Assert.StartsWith($"/api/public/restaurants/{restaurant.Slug}/gallery/{photo.Id}?v=", photo.Url);
        Assert.Null(photo.Caption);
        Assert.Equal([photo], await GalleryOf(admin));

        using var guest = factory.CreateHttpsClient();
        var image = await guest.GetAsync(photo.Url, Ct);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal(contentType, image.Content.Headers.ContentType?.MediaType);
        Assert.Equal(content, await image.Content.ReadAsByteArrayAsync(Ct));
    }

    [Fact]
    public async Task A_photo_with_its_current_version_may_be_cached_long_otherwise_it_is_revalidated()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var photo = await UploadOkAsync(admin);
        using var guest = factory.CreateHttpsClient();

        var current = await guest.GetAsync(photo.Url, Ct);
        var withoutVersion = await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/gallery/{photo.Id}", Ct);
        var outdated = await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/gallery/{photo.Id}?v=old", Ct);

        Assert.Equal(TimeSpan.FromDays(365), current.Headers.CacheControl?.MaxAge);
        Assert.True(current.Headers.CacheControl?.Public);
        Assert.True(withoutVersion.Headers.CacheControl?.NoCache);
        Assert.True(outdated.Headers.CacheControl?.NoCache);
        Assert.Equal(Jpeg, await outdated.Content.ReadAsByteArrayAsync(Ct));
    }

    [Fact]
    public async Task New_photos_come_last_and_the_public_restaurant_lists_the_gallery_in_its_order()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var first = await UploadOkAsync(admin);
        var second = await UploadOkAsync(admin, Png, "image/png");
        var third = await UploadOkAsync(admin, WebP, "image/webp");
        var captioned = (await (await admin.PutAsJsonAsync($"{Path}/{second.Id}", new { caption = "Kaiserschmarrn" }, Ct)).Content.ReadFromJsonAsync<GalleryPhotoResponse>(Ct))!;

        Assert.Equal([first, captioned, third], await GalleryOf(admin));
        using var guest = factory.CreateHttpsClient();
        var publicRestaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct))!;
        Assert.Equal([first, captioned, third], publicRestaurant.Gallery);
    }

    [Fact]
    public async Task The_order_can_be_changed_with_every_photo_once()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var a = await UploadOkAsync(admin);
        var b = await UploadOkAsync(admin);
        var c = await UploadOkAsync(admin);

        var response = await admin.PutAsJsonAsync($"{Path}/order", new { photoIds = new[] { c.Id, a.Id, b.Id } }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal([c, a, b], await response.Content.ReadFromJsonAsync<List<GalleryPhotoResponse>>(Ct));
        Assert.Equal([c, a, b], await GalleryOf(admin));
        using var guest = factory.CreateHttpsClient();
        var publicRestaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct))!;
        Assert.Equal([c.Id, a.Id, b.Id], publicRestaurant.Gallery.Select(p => p.Id));
        // A new photo still comes last.
        var d = await UploadOkAsync(admin);
        Assert.Equal([c.Id, a.Id, b.Id, d.Id], (await GalleryOf(admin)).Select(p => p.Id));
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("twice")]
    [InlineData("unknown")]
    [InlineData("other restaurant")]
    [InlineData("empty")]
    [InlineData("absent")]
    public async Task An_order_without_every_photo_exactly_once_is_rejected(string kind)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var a = await UploadOkAsync(admin);
        var b = await UploadOkAsync(admin);
        var (_, otherAdmin) = await CreateRestaurantAsync();
        var foreign = await UploadOkAsync(otherAdmin);
        object body = kind switch
        {
            "missing" => new { photoIds = new[] { b.Id } },
            "twice" => new { photoIds = new[] { b.Id, a.Id, b.Id } },
            "unknown" => new { photoIds = new[] { b.Id, a.Id, Guid.NewGuid() } },
            "other restaurant" => new { photoIds = new[] { b.Id, foreign.Id } },
            "empty" => new { photoIds = Array.Empty<Guid>() },
            _ => new { },
        };

        var response = await admin.PutAsJsonAsync($"{Path}/order", body, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_order", await ErrorOf(response));
        Assert.Equal([a, b], await GalleryOf(admin));
        Assert.Equal([foreign], await GalleryOf(otherAdmin));
    }

    [Fact]
    public async Task An_empty_gallery_can_be_ordered_with_an_empty_list()
    {
        var (_, admin) = await CreateRestaurantAsync();

        var response = await admin.PutAsJsonAsync($"{Path}/order", new { photoIds = Array.Empty<Guid>() }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<List<GalleryPhotoResponse>>(Ct))!);
    }

    [Theory]
    [InlineData("  Brezn frisch aus dem Ofen  ", "Brezn frisch aus dem Ofen")]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData(null, null)]
    public async Task The_caption_is_trimmed_and_an_empty_one_is_null(string? caption, string? expected)
    {
        var (_, admin) = await CreateRestaurantAsync();
        var photo = await UploadOkAsync(admin);
        (await admin.PutAsJsonAsync($"{Path}/{photo.Id}", new { caption = "Vorher" }, Ct)).EnsureSuccessStatusCode();

        var response = await admin.PutAsJsonAsync($"{Path}/{photo.Id}", new { caption }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(photo with { Caption = expected }, await response.Content.ReadFromJsonAsync<GalleryPhotoResponse>(Ct));
        Assert.Equal([photo with { Caption = expected }], await GalleryOf(admin));
    }

    [Fact]
    public async Task A_caption_may_have_at_most_120_characters()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var photo = await UploadOkAsync(admin);
        var longest = new string('a', GalleryPhoto.MaxCaptionLength);

        var ok = await admin.PutAsJsonAsync($"{Path}/{photo.Id}", new { caption = $" {longest} " }, Ct);
        var tooLong = await admin.PutAsJsonAsync($"{Path}/{photo.Id}", new { caption = longest + "a" }, Ct);

        Assert.Equal(120, GalleryPhoto.MaxCaptionLength);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal("invalid_caption", await ErrorOf(tooLong));
        Assert.Equal(longest, Assert.Single(await GalleryOf(admin)).Caption);
    }

    [Fact]
    public async Task The_gallery_holds_at_most_20_photos()
    {
        var (_, admin) = await CreateRestaurantAsync();
        for (var i = 0; i < GalleryPhoto.MaxPhotos; i++)
        {
            await UploadOkAsync(admin);
        }
        var filesBefore = UploadedFileCount();

        var response = await UploadAsync(admin, Jpeg);

        Assert.Equal(20, GalleryPhoto.MaxPhotos);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("gallery_full", await ErrorOf(response));
        Assert.Equal(20, (await GalleryOf(admin)).Count);
        Assert.Equal(filesBefore, UploadedFileCount());

        // After deleting one there is room again.
        (await admin.DeleteAsync($"{Path}/{(await GalleryOf(admin))[0].Id}", Ct)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Created, (await UploadAsync(admin, Jpeg)).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_photo_removes_it_and_its_file()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var kept = await UploadOkAsync(admin);
        var photo = await UploadOkAsync(admin, Png, "image/png");
        Assert.True(File.Exists(FileOf(photo.Url, ".png")));

        var response = await admin.DeleteAsync($"{Path}/{photo.Id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(File.Exists(FileOf(photo.Url, ".png")));
        Assert.True(File.Exists(FileOf(kept.Url, ".jpg")));
        Assert.Equal([kept], await GalleryOf(admin));
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(photo.Url, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{Path}/{photo.Id}", Ct)).StatusCode);
        var publicRestaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct))!;
        Assert.Equal([kept], publicRestaurant.Gallery);
    }

    [Theory]
    [InlineData("svg")]
    [InlineData("gif")]
    [InlineData("text")]
    [InlineData("empty")]
    public async Task An_upload_checks_the_content_not_the_declared_type(string type)
    {
        byte[] content = type switch
        {
            "svg" => Svg,
            "gif" => Gif,
            "text" => "Kafana Dunav"u8.ToArray(),
            _ => [],
        };
        var (_, admin) = await CreateRestaurantAsync();
        var filesBefore = UploadedFileCount();

        var response = await UploadAsync(admin, content, type == "svg" ? "image/svg+xml" : "image/jpeg");

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal("floor_plan_type_invalid", await ErrorOf(response));
        Assert.Empty(await GalleryOf(admin));
        Assert.Equal(filesBefore, UploadedFileCount());
    }

    [Fact]
    public async Task A_photo_may_have_at_most_10_MB()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var exactlyTheLimit = new byte[MaxPhotoBytes];
        Jpeg.CopyTo(exactlyTheLimit, 0);
        var tooLarge = new byte[MaxPhotoBytes + 1];
        Jpeg.CopyTo(tooLarge, 0);

        var rejected = await UploadAsync(admin, tooLarge);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, rejected.StatusCode);
        Assert.Equal("floor_plan_too_large", await ErrorOf(rejected));
        Assert.Empty(await GalleryOf(admin));

        Assert.Equal(10 * 1024 * 1024, MaxPhotoBytes);
        Assert.Equal(HttpStatusCode.Created, (await UploadAsync(admin, exactlyTheLimit)).StatusCode);
    }

    [Fact]
    public async Task Unknown_photos_are_not_found()
    {
        var (_, admin) = await CreateRestaurantAsync();
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"{Path}/{id}", new { caption = "x" }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{Path}/{id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task An_admin_only_reads_and_changes_the_gallery_of_their_own_restaurant()
    {
        var (restaurantA, adminA) = await CreateRestaurantAsync();
        var (restaurantB, adminB) = await CreateRestaurantAsync();
        var photoA = await UploadOkAsync(adminA, Png, "image/png");
        (await adminA.PutAsJsonAsync($"{Path}/{photoA.Id}", new { caption = "Stube mit Kachelofen" }, Ct)).EnsureSuccessStatusCode();
        photoA = photoA with { Caption = "Stube mit Kachelofen" };

        // B sees nothing of A, and every change of B on A's photo is 404.
        Assert.Empty(await GalleryOf(adminB));
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PutAsJsonAsync($"{Path}/{photoA.Id}", new { caption = "von B" }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.DeleteAsync($"{Path}/{photoA.Id}", Ct)).StatusCode);
        var reorder = await adminB.PutAsJsonAsync($"{Path}/order", new { photoIds = new[] { photoA.Id } }, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, reorder.StatusCode);
        Assert.Equal("invalid_order", await ErrorOf(reorder));
        // B's upload lands in B's gallery under B's slug.
        var photoB = await UploadOkAsync(adminB);
        Assert.StartsWith($"/api/public/restaurants/{restaurantB.Slug}/gallery/", photoB.Url);

        Assert.Equal([photoA], await GalleryOf(adminA));
        Assert.Equal([photoB], await GalleryOf(adminB));
        Assert.True(File.Exists(FileOf(photoA.Url, ".png")));

        // Guests only get a photo under its own restaurant.
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(Png, await guest.GetByteArrayAsync(photoA.Url, Ct));
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurantB.Slug}/gallery/{photoA.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurantA.Slug}/gallery/{photoB.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurantA.Slug}/gallery/{Guid.NewGuid()}", Ct)).StatusCode);
        var publicA = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurantA.Slug}", Ct))!;
        var publicB = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurantB.Slug}", Ct))!;
        Assert.Equal([photoA], publicA.Gallery);
        Assert.Equal([photoB], publicB.Gallery);
    }

    [Fact]
    public async Task A_deactivated_restaurant_shows_no_gallery_photos()
    {
        var (restaurant, admin) = await CreateRestaurantAsync();
        var photo = await UploadOkAsync(admin);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Tenants.Single(t => t.Id == restaurant.Id).IsActive = false;
            await db.SaveChangesAsync(Ct);
        }
        using var guest = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(photo.Url, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/gallery/{photo.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("GET", Path)]
    [InlineData("POST", Path)]
    [InlineData("PUT", Path + "/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", Path + "/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", Path + "/order")]
    public async Task The_gallery_is_managed_by_tenant_admins_only(string method, string path)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, []);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");
        HttpRequestMessage Request() => new(new HttpMethod(method), path)
        {
            Content = method switch
            {
                "POST" => new ByteArrayContent(Jpeg),
                "PUT" => path.EndsWith("/order") ? JsonContent.Create(new { photoIds = Array.Empty<Guid>() }) : JsonContent.Create(new { caption = "x" }),
                _ => null,
            },
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await superadmin.SendAsync(Request(), Ct)).StatusCode);
    }
}
