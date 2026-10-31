using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;

namespace Cbplayground.Api.Tests;

public class ReservationSettingsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/reservation-settings";

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private async Task<HttpClient> SignedInClientAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Token);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private static ReservationSettingsDto Settings(int defaultDuration = 120, params DurationRuleDto[] rules) =>
        new(ConfirmationMode.Instant, TableSelectionMode.SystemAssigns, defaultDuration, rules);

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<SettingsError>(Token))?.Error;

    [Fact]
    public async Task A_restaurant_without_saved_settings_gets_the_defaults()
    {
        // Kafana Dunav never saves settings in these tests.
        using var client = await SignedInClientAsync("admin@kafana-dunav.test");

        var settings = await client.GetFromJsonAsync<ReservationSettingsDto>(Path, Token);

        Assert.NotNull(settings);
        Assert.Equal(ConfirmationMode.Instant, settings.ConfirmationMode);
        Assert.Equal(120, settings.DefaultDurationMinutes);
        Assert.Empty(settings.DurationRules!);
    }

    [Fact]
    public async Task Saved_settings_and_rules_are_returned_on_the_next_read()
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");
        var saved = new ReservationSettingsDto(ConfirmationMode.Request, TableSelectionMode.GuestChooses, 105,
            [new DurationRuleDto(3, 6, 120), new DurationRuleDto(1, 2, 90)]);

        var put = await client.PutAsJsonAsync(Path, saved, Token);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var settings = await client.GetFromJsonAsync<ReservationSettingsDto>(Path, Token);
        Assert.NotNull(settings);
        Assert.Equal(ConfirmationMode.Request, settings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.GuestChooses, settings.TableSelectionMode);
        Assert.Equal(105, settings.DefaultDurationMinutes);
        Assert.Equal([new DurationRuleDto(1, 2, 90), new DurationRuleDto(3, 6, 120)], settings.DurationRules);

        // Saving again replaces the rules: one changed, one deleted.
        put = await client.PutAsJsonAsync(Path, Settings(120, new DurationRuleDto(1, 4, 75)), Token);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        settings = await client.GetFromJsonAsync<ReservationSettingsDto>(Path, Token);
        Assert.Equal([new DurationRuleDto(1, 4, 75)], settings?.DurationRules);
    }

    [Fact]
    public async Task The_modes_are_sent_as_names()
    {
        using var client = await SignedInClientAsync("admin@kafana-dunav.test");

        var json = await client.GetStringAsync(Path, Token);

        Assert.Contains("\"confirmationMode\":\"Instant\"", json);
        Assert.Contains("\"tableSelectionMode\":\"SystemAssigns\"", json);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(10)]
    [InlineData(100)]
    [InlineData(495)]
    public async Task A_default_duration_outside_15_to_480_in_steps_of_15_is_rejected(int minutes)
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(minutes), Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_duration", await ErrorAsync(response));
    }

    [Theory]
    [InlineData(15)]
    [InlineData(480)]
    public async Task The_duration_limits_are_allowed(int minutes)
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(minutes, new DurationRuleDto(1, 2, minutes)), Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_rule_duration_outside_the_limits_is_rejected()
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(120, new DurationRuleDto(1, 2, 500)), Token);

        Assert.Equal("invalid_duration", await ErrorAsync(response));
    }

    [Fact]
    public async Task A_rule_with_min_greater_than_max_is_rejected()
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(120, new DurationRuleDto(5, 3, 90)), Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("min_greater_than_max", await ErrorAsync(response));
    }

    [Fact]
    public async Task A_rule_below_one_guest_is_rejected()
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(120, new DurationRuleDto(0, 2, 90)), Token);

        Assert.Equal("invalid_min_guests", await ErrorAsync(response));
    }

    [Theory]
    [InlineData(1, 4, 4, 6)]
    [InlineData(3, 6, 1, 3)]
    [InlineData(1, 10, 4, 5)]
    public async Task Overlapping_rules_are_rejected(int min1, int max1, int min2, int max2)
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(120, new DurationRuleDto(min1, max1, 90), new DurationRuleDto(min2, max2, 120)), Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("overlapping_rules", await ErrorAsync(response));
    }

    [Fact]
    public async Task Rules_with_gaps_are_allowed()
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Settings(120, new DurationRuleDto(1, 2, 90), new DurationRuleDto(5, 8, 150)), Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_rejected_save_changes_nothing()
    {
        using var client = await SignedInClientAsync("admin@zur-linde.test");
        await client.PutAsJsonAsync(Path, Settings(135, new DurationRuleDto(1, 2, 90)), Token);

        await client.PutAsJsonAsync(Path, Settings(240, new DurationRuleDto(1, 4, 90), new DurationRuleDto(2, 3, 90)), Token);

        var settings = await client.GetFromJsonAsync<ReservationSettingsDto>(Path, Token);
        Assert.Equal(135, settings?.DefaultDurationMinutes);
        Assert.Equal([new DurationRuleDto(1, 2, 90)], settings?.DurationRules);
    }

    [Fact]
    public async Task An_admin_only_sees_and_changes_the_settings_of_their_own_restaurant()
    {
        using var linde = await SignedInClientAsync("admin@zur-linde.test");
        using var dunav = await SignedInClientAsync("admin@kafana-dunav.test");

        await linde.PutAsJsonAsync(Path, new ReservationSettingsDto(ConfirmationMode.Request, TableSelectionMode.GuestChooses, 300, [new DurationRuleDto(1, 20, 60)]), Token);

        var settings = await dunav.GetFromJsonAsync<ReservationSettingsDto>(Path, Token);
        Assert.NotNull(settings);
        Assert.Equal(ConfirmationMode.Instant, settings.ConfirmationMode);
        Assert.Equal(120, settings.DefaultDurationMinutes);
        Assert.Empty(settings.DurationRules!);
    }

    [Fact]
    public async Task Front_desk_users_get_403()
    {
        using var client = await SignedInClientAsync("frontdesk@zur-linde.test");

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Path, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(Path, Settings(), Token)).StatusCode);
    }

    [Fact]
    public async Task Without_sign_in_the_settings_return_401()
    {
        using var client = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Path, Token)).StatusCode);
    }
}
