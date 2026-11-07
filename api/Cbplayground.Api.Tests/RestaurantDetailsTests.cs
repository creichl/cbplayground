using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.RestaurantDetailsEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The details (cuisines, price level, features, house rules) and the frequently asked questions; every test on a restaurant of its own.</summary>
public class RestaurantDetailsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string DetailsPath = "/api/admin/details";
    private const string FaqPath = "/api/admin/faq";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct);
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(TestRestaurant Restaurant, HttpClient Admin)> RestaurantAsync()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, []);
        return (restaurant, await LoginAsync(restaurant.AdminEmail));
    }

    private static object Details(string[]? cuisines = null, int? priceLevel = 2, string[]? features = null, string? houseRules = "Keine Hunde in der Stube.") =>
        new { cuisines = cuisines ?? ["Italian"], priceLevel, features = features ?? ["Terrace"], houseRules };

    private static async Task<string?> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;

    private static async Task<FaqResponse> AddFaqAsync(HttpClient client, string question, string answer = "Ja.")
    {
        var response = await client.PostAsJsonAsync(FaqPath, new { question, answer }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<FaqResponse>(Ct))!;
    }

    [Fact]
    public async Task A_new_restaurant_has_no_details()
    {
        var (_, admin) = await RestaurantAsync();

        AssertDetails(new DetailsResponse([], null, [], null), (await admin.GetFromJsonAsync<DetailsResponse>(DetailsPath, Ct))!);
        Assert.Empty((await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct))!);
    }

    [Fact]
    public async Task Saved_details_are_returned_with_the_cuisines_in_their_order_and_the_features_in_the_list_order()
    {
        var (_, admin) = await RestaurantAsync();

        var put = await admin.PutAsJsonAsync(DetailsPath, Details(["Serbian", "Balkan", "Serbian"], 4, ["LiveMusic", "Garden", "Garden"], "  Rauchen nur im Garten.\nDanke!  "), Ct);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var expected = new DetailsResponse([Cuisine.Serbian, Cuisine.Balkan], 4, [RestaurantFeature.Garden, RestaurantFeature.LiveMusic], "Rauchen nur im Garten.\nDanke!");
        AssertDetails(expected, (await put.Content.ReadFromJsonAsync<DetailsResponse>(Ct))!);
        AssertDetails(expected, (await admin.GetFromJsonAsync<DetailsResponse>(DetailsPath, Ct))!);
    }

    [Fact]
    public async Task Details_can_be_emptied_again()
    {
        var (_, admin) = await RestaurantAsync();
        (await admin.PutAsJsonAsync(DetailsPath, Details(), Ct)).EnsureSuccessStatusCode();

        (await admin.PutAsJsonAsync(DetailsPath, new { cuisines = Array.Empty<string>(), priceLevel = (int?)null, features = (string[]?)null, houseRules = "   " }, Ct)).EnsureSuccessStatusCode();

        AssertDetails(new DetailsResponse([], null, [], null), (await admin.GetFromJsonAsync<DetailsResponse>(DetailsPath, Ct))!);
    }

    [Theory]
    [InlineData(new[] { "Klingon" }, 2, new[] { "Terrace" }, "invalid_cuisine")]
    [InlineData(new[] { "italian" }, 2, new[] { "Terrace" }, "invalid_cuisine")]
    [InlineData(new[] { "5" }, 2, new[] { "Terrace" }, "invalid_cuisine")]
    [InlineData(new[] { "Italian", "French", "Mediterranean", "International" }, 2, new[] { "Terrace" }, "too_many_cuisines")]
    [InlineData(new[] { "Italian" }, 0, new[] { "Terrace" }, "invalid_price_level")]
    [InlineData(new[] { "Italian" }, 5, new[] { "Terrace" }, "invalid_price_level")]
    [InlineData(new[] { "Italian" }, -1, new[] { "Terrace" }, "invalid_price_level")]
    [InlineData(new[] { "Italian" }, 2, new[] { "Pool" }, "invalid_feature")]
    [InlineData(new[] { "Italian" }, 2, new[] { "Terrace", "0" }, "invalid_feature")]
    public async Task Invalid_details_are_rejected_and_change_nothing(string[] cuisines, int priceLevel, string[] features, string error)
    {
        var (_, admin) = await RestaurantAsync();
        (await admin.PutAsJsonAsync(DetailsPath, Details(["Bavarian"], 1, ["Garden"], null), Ct)).EnsureSuccessStatusCode();

        var response = await admin.PutAsJsonAsync(DetailsPath, Details(cuisines, priceLevel, features), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await ErrorOf(response));
        AssertDetails(new DetailsResponse([Cuisine.Bavarian], 1, [RestaurantFeature.Garden], null), (await admin.GetFromJsonAsync<DetailsResponse>(DetailsPath, Ct))!);
    }

    [Fact]
    public async Task Three_cuisines_and_every_price_level_from_1_to_4_are_accepted()
    {
        var (_, admin) = await RestaurantAsync();

        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync(DetailsPath, Details(["Italian", "French", "Mediterranean"]), Ct)).StatusCode);
        for (var level = 1; level <= 4; level++)
        {
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync(DetailsPath, Details(priceLevel: level), Ct)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync(DetailsPath, Details(features: Enum.GetNames<RestaurantFeature>()), Ct)).StatusCode);
        Assert.Equal(Enum.GetValues<RestaurantFeature>(), (await admin.GetFromJsonAsync<DetailsResponse>(DetailsPath, Ct))!.Features);
    }

    [Fact]
    public async Task House_rules_of_up_to_1000_characters_are_accepted()
    {
        var (_, admin) = await RestaurantAsync();

        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync(DetailsPath, Details(houseRules: new string('a', 1000)), Ct)).StatusCode);

        var response = await admin.PutAsJsonAsync(DetailsPath, Details(houseRules: new string('a', 1001)), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_house_rules", await ErrorOf(response));
    }

    [Fact]
    public async Task Questions_are_added_at_the_end_changed_reordered_and_deleted()
    {
        var (_, admin) = await RestaurantAsync();
        var dogs = await AddFaqAsync(admin, "  Darf ich meinen Hund mitbringen? ", " Ja, gerne.\nWasser gibt es auch. ");
        var parking = await AddFaqAsync(admin, "Wo kann ich parken?");
        var groups = await AddFaqAsync(admin, "Kann ich mit einer Gruppe kommen?");
        Assert.Equal(("Darf ich meinen Hund mitbringen?", "Ja, gerne.\nWasser gibt es auch."), (dogs.Question, dogs.Answer));

        var put = await admin.PutAsJsonAsync($"{FaqPath}/{parking.Id}", new { question = "Gibt es Parkplätze?", answer = "Ja, 12 hinter dem Haus." }, Ct);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(new FaqResponse(parking.Id, "Gibt es Parkplätze?", "Ja, 12 hinter dem Haus."), await put.Content.ReadFromJsonAsync<FaqResponse>(Ct));

        var order = await admin.PutAsJsonAsync($"{FaqPath}/order", new { ids = new[] { groups.Id, dogs.Id, parking.Id } }, Ct);
        Assert.Equal(HttpStatusCode.OK, order.StatusCode);
        Assert.Equal([groups.Id, dogs.Id, parking.Id], (await order.Content.ReadFromJsonAsync<List<FaqResponse>>(Ct))!.Select(f => f.Id));
        Assert.Equal([groups.Id, dogs.Id, parking.Id], (await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct))!.Select(f => f.Id));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{FaqPath}/{dogs.Id}", Ct)).StatusCode);
        Assert.Equal([groups.Id, parking.Id], (await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct))!.Select(f => f.Id));
        // A question added after a reorder and a deletion comes last.
        var last = await AddFaqAsync(admin, "Gibt es ein Kindermenü?");
        Assert.Equal([groups.Id, parking.Id, last.Id], (await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct))!.Select(f => f.Id));
    }

    [Theory]
    [InlineData("", "Ja.", "invalid_question")]
    [InlineData("   ", "Ja.", "invalid_question")]
    [InlineData(null, "Ja.", "invalid_question")]
    [InlineData("Hund?", "", "invalid_answer")]
    [InlineData("Hund?", null, "invalid_answer")]
    public async Task An_empty_question_or_answer_is_rejected(string? question, string? answer, string error)
    {
        var (_, admin) = await RestaurantAsync();
        var faq = await AddFaqAsync(admin, "Darf ich meinen Hund mitbringen?");

        var post = await admin.PostAsJsonAsync(FaqPath, new { question, answer }, Ct);
        var put = await admin.PutAsJsonAsync($"{FaqPath}/{faq.Id}", new { question, answer }, Ct);

        Assert.Equal((HttpStatusCode.BadRequest, error), (post.StatusCode, await ErrorOf(post)));
        Assert.Equal((HttpStatusCode.BadRequest, error), (put.StatusCode, await ErrorOf(put)));
        Assert.Equal([faq], await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct));
    }

    [Fact]
    public async Task Questions_of_up_to_150_and_answers_of_up_to_600_characters_are_accepted()
    {
        var (_, admin) = await RestaurantAsync();

        await AddFaqAsync(admin, new string('q', 150), new string('a', 600));

        var question = await admin.PostAsJsonAsync(FaqPath, new { question = new string('q', 151), answer = "Ja." }, Ct);
        var answer = await admin.PostAsJsonAsync(FaqPath, new { question = "Hund?", answer = new string('a', 601) }, Ct);
        Assert.Equal((HttpStatusCode.BadRequest, "invalid_question"), (question.StatusCode, await ErrorOf(question)));
        Assert.Equal((HttpStatusCode.BadRequest, "invalid_answer"), (answer.StatusCode, await ErrorOf(answer)));
    }

    [Fact]
    public async Task A_restaurant_has_at_most_12_questions()
    {
        var (_, admin) = await RestaurantAsync();
        for (var i = 1; i <= 12; i++)
        {
            await AddFaqAsync(admin, $"Frage {i}?");
        }

        var response = await admin.PostAsJsonAsync(FaqPath, new { question = "Frage 13?", answer = "Ja." }, Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("faq_full", await ErrorOf(response));
        Assert.Equal(12, (await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct))!.Count);
    }

    [Fact]
    public async Task An_order_without_every_question_exactly_once_is_rejected()
    {
        var (_, admin) = await RestaurantAsync();
        var first = await AddFaqAsync(admin, "Erste?");
        var second = await AddFaqAsync(admin, "Zweite?");

        foreach (var ids in new[] { new[] { first.Id }, [first.Id, first.Id], [first.Id, second.Id, Guid.NewGuid()], [second.Id, Guid.NewGuid()] })
        {
            var response = await admin.PutAsJsonAsync($"{FaqPath}/order", new { ids }, Ct);
            Assert.Equal((HttpStatusCode.BadRequest, "invalid_order"), (response.StatusCode, await ErrorOf(response)));
        }
        Assert.Equal([first.Id, second.Id], (await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct))!.Select(f => f.Id));
    }

    [Fact]
    public async Task The_public_restaurant_carries_the_details_and_the_questions_in_their_order()
    {
        var (restaurant, admin) = await RestaurantAsync();
        (await admin.PutAsJsonAsync(DetailsPath, Details(["Japanese", "Asian"], 3, ["WheelchairAccessible", "Rooftop"], "Smart casual."), Ct)).EnsureSuccessStatusCode();
        var first = await AddFaqAsync(admin, "Gibt es einen Lift?", "Ja.");
        var second = await AddFaqAsync(admin, "Ab welchem Alter?", "Ab 18.");
        (await admin.PutAsJsonAsync($"{FaqPath}/order", new { ids = new[] { second.Id, first.Id } }, Ct)).EnsureSuccessStatusCode();
        using var guest = factory.CreateHttpsClient();

        var publicRestaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct))!;

        Assert.Equal([Cuisine.Japanese, Cuisine.Asian], publicRestaurant.Cuisines);
        Assert.Equal(3, publicRestaurant.PriceLevel);
        Assert.Equal([RestaurantFeature.Rooftop, RestaurantFeature.WheelchairAccessible], publicRestaurant.Features);
        Assert.Equal("Smart casual.", publicRestaurant.HouseRules);
        Assert.Equal([new PublicFaq("Ab welchem Alter?", "Ab 18."), new PublicFaq("Gibt es einen Lift?", "Ja.")], publicRestaurant.Faq);
        // On the wire the names, as the web expects them.
        var json = await guest.GetStringAsync($"/api/public/restaurants/{restaurant.Slug}", Ct);
        Assert.Contains("\"cuisines\":[\"Japanese\",\"Asian\"]", json);
        Assert.Contains("\"features\":[\"Rooftop\",\"WheelchairAccessible\"]", json);
        Assert.Contains("\"faq\":[{\"question\":\"Ab welchem Alter?\",\"answer\":\"Ab 18.\"}", json);
    }

    [Fact]
    public async Task The_restaurant_list_carries_cuisines_price_level_and_features()
    {
        var (restaurant, admin) = await RestaurantAsync();
        var (other, _) = await RestaurantAsync();
        (await admin.PutAsJsonAsync(DetailsPath, Details(["SteakGrill"], 4, ["Parking", "CardPayment"], "Nur mit Reservierung."), Ct)).EnsureSuccessStatusCode();
        using var guest = factory.CreateHttpsClient();

        var tenants = (await guest.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct))!;

        var item = Assert.Single(tenants, t => t.Slug == restaurant.Slug);
        Assert.Equal([Cuisine.SteakGrill], item.Cuisines);
        Assert.Equal(4, item.PriceLevel);
        Assert.Equal([RestaurantFeature.Parking, RestaurantFeature.CardPayment], item.Features);
        var otherItem = Assert.Single(tenants, t => t.Slug == other.Slug);
        Assert.Empty(otherItem.Cuisines);
        Assert.Null(otherItem.PriceLevel);
        Assert.Empty(otherItem.Features);
        // The house rules are not part of the list.
        Assert.DoesNotContain("houseRules", await guest.GetStringAsync("/api/tenants", Ct));
    }

    [Fact]
    public async Task An_admin_only_sees_and_changes_the_details_and_questions_of_their_own_restaurant()
    {
        var (restaurant, admin) = await RestaurantAsync();
        var (other, otherAdmin) = await RestaurantAsync();
        (await otherAdmin.PutAsJsonAsync(DetailsPath, Details(["French"], 4, ["View"], "Jackett erwünscht."), Ct)).EnsureSuccessStatusCode();
        var otherFaq = await AddFaqAsync(otherAdmin, "Gibt es eine Garderobe?");

        (await admin.PutAsJsonAsync(DetailsPath, Details(["German"], 1, ["Wifi"], null), Ct)).EnsureSuccessStatusCode();
        var ownFaq = await AddFaqAsync(admin, "Gibt es WLAN?");

        // Another restaurant's question is not found.
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"{FaqPath}/{otherFaq.Id}", new { question = "Gekapert?", answer = "Ja." }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{FaqPath}/{otherFaq.Id}", Ct)).StatusCode);
        var order = await admin.PutAsJsonAsync($"{FaqPath}/order", new { ids = new[] { ownFaq.Id, otherFaq.Id } }, Ct);
        Assert.Equal("invalid_order", await ErrorOf(order));

        Assert.Equal([ownFaq], await admin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct));
        Assert.Equal([otherFaq], await otherAdmin.GetFromJsonAsync<List<FaqResponse>>(FaqPath, Ct));
        AssertDetails(new DetailsResponse([Cuisine.French], 4, [RestaurantFeature.View], "Jackett erwünscht."), (await otherAdmin.GetFromJsonAsync<DetailsResponse>(DetailsPath, Ct))!);
        using var guest = factory.CreateHttpsClient();
        var otherPublic = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{other.Slug}", Ct))!;
        Assert.Equal([new PublicFaq("Gibt es eine Garderobe?", "Ja.")], otherPublic.Faq);
        var ownPublic = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Ct))!;
        Assert.Equal([new PublicFaq("Gibt es WLAN?", "Ja.")], ownPublic.Faq);
    }

    [Theory]
    [InlineData("GET", DetailsPath)]
    [InlineData("PUT", DetailsPath)]
    [InlineData("GET", FaqPath)]
    [InlineData("POST", FaqPath)]
    [InlineData("PUT", FaqPath + "/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", FaqPath + "/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", FaqPath + "/order")]
    public async Task Details_and_questions_are_for_tenant_admins_only(string method, string path)
    {
        var (restaurant, _) = await RestaurantAsync();
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await LoginAsync(restaurant.FrontDeskEmail);
        HttpRequestMessage Request() => new(new HttpMethod(method), path)
        {
            Content = method is "PUT" or "POST" ? JsonContent.Create(new { question = "Hund?", answer = "Ja." }) : null,
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(Request(), Ct)).StatusCode);
    }

    /// <summary>Records with lists compare the lists by reference, so the fields are compared one by one.</summary>
    private static void AssertDetails(DetailsResponse expected, DetailsResponse actual)
    {
        Assert.Equal(expected.Cuisines, actual.Cuisines);
        Assert.Equal(expected.PriceLevel, actual.PriceLevel);
        Assert.Equal(expected.Features, actual.Features);
        Assert.Equal(expected.HouseRules, actual.HouseRules);
    }
}

/// <summary>
/// The demo details and questions of the development seed, on a factory of its own: the other seed tests expect the profiles
/// as they find them.
/// </summary>
public class DevelopmentSeedDetailsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task SeedAsync()
    {
        using var scope = factory.Services.CreateScope();
        await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
    }

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct)).EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task The_seed_fills_the_details_of_the_demo_restaurants_once_and_keeps_what_the_admin_maintained()
    {
        await SeedAsync();
        using var guest = factory.CreateHttpsClient();
        var expected = new Dictionary<string, (Cuisine[] Cuisines, int PriceLevel, RestaurantFeature Feature)>
        {
            ["zur-linde"] = ([Cuisine.Bavarian], 2, RestaurantFeature.DogsWelcome),
            ["kafana-dunav"] = ([Cuisine.Serbian, Cuisine.Balkan], 2, RestaurantFeature.LiveMusic),
            ["rooftop-belvedere"] = ([Cuisine.BarCocktails, Cuisine.Mediterranean], 3, RestaurantFeature.Rooftop),
        };
        foreach (var (slug, demo) in expected)
        {
            var restaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{slug}", Ct))!;
            Assert.Equal(demo.Cuisines, restaurant.Cuisines);
            Assert.Equal(demo.PriceLevel, restaurant.PriceLevel);
            Assert.Contains(demo.Feature, restaurant.Features);
            Assert.InRange(restaurant.HouseRules?.Length ?? 0, 1, Tenant.MaxHouseRulesLength);
            Assert.InRange(restaurant.Faq.Count, 4, 5);
            Assert.All(restaurant.Faq, f => Assert.InRange(f.Question.Length, 1, RestaurantFaq.MaxQuestionLength));
            Assert.All(restaurant.Faq, f => Assert.InRange(f.Answer.Length, 1, RestaurantFaq.MaxAnswerLength));
            // The description in 3 to 4 short paragraphs.
            Assert.InRange(restaurant.Description?.Length ?? 0, 1, Tenant.MaxDescriptionLength);
            Assert.InRange(restaurant.Description!.Split("\n\n").Length, 3, 4);
        }
        Assert.Contains("Dresscode", (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>("/api/public/restaurants/rooftop-belvedere", Ct))!.HouseRules);

        // Linde's admin keeps only a price level, Dunav's admin deletes the details and all but one question.
        using var linde = await LoginAsync("admin@zur-linde.test");
        (await linde.PutAsJsonAsync("/api/admin/details", new { cuisines = Array.Empty<string>(), priceLevel = 3, features = Array.Empty<string>(), houseRules = (string?)null }, Ct)).EnsureSuccessStatusCode();
        foreach (var faq in (await linde.GetFromJsonAsync<List<FaqResponse>>("/api/admin/faq", Ct))!)
        {
            (await linde.DeleteAsync($"/api/admin/faq/{faq.Id}", Ct)).EnsureSuccessStatusCode();
        }
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        (await dunav.PutAsJsonAsync("/api/admin/details", new { cuisines = Array.Empty<string>() }, Ct)).EnsureSuccessStatusCode();
        var dunavFaq = (await dunav.GetFromJsonAsync<List<FaqResponse>>("/api/admin/faq", Ct))!;
        foreach (var faq in dunavFaq.Skip(1))
        {
            (await dunav.DeleteAsync($"/api/admin/faq/{faq.Id}", Ct)).EnsureSuccessStatusCode();
        }

        await SeedAsync();

        var lindeDetails = (await linde.GetFromJsonAsync<DetailsResponse>("/api/admin/details", Ct))!;
        Assert.Empty(lindeDetails.Cuisines);
        Assert.Equal(3, lindeDetails.PriceLevel);
        Assert.Empty(lindeDetails.Features);
        Assert.Null(lindeDetails.HouseRules);
        Assert.Empty((await linde.GetFromJsonAsync<List<FaqResponse>>("/api/admin/faq", Ct))!);
        var dunavDetails = (await dunav.GetFromJsonAsync<DetailsResponse>("/api/admin/details", Ct))!;
        Assert.Empty(dunavDetails.Cuisines);
        Assert.Null(dunavDetails.PriceLevel);
        Assert.Empty(dunavDetails.Features);
        Assert.Null(dunavDetails.HouseRules);
        Assert.Equal([dunavFaq[0]], await dunav.GetFromJsonAsync<List<FaqResponse>>("/api/admin/faq", Ct));
        // Rooftop Belvedere, which nobody changed, has its questions once.
        Assert.InRange((await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>("/api/public/restaurants/rooftop-belvedere", Ct))!.Faq.Count, 4, 5);
    }
}
