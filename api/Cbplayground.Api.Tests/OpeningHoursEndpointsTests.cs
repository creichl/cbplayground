using System.Net;
using System.Net.Http.Json;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;

namespace Cbplayground.Api.Tests;

public class OpeningHoursEndpointsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static Task<HttpResponseMessage> PutHoursAsync(HttpClient client, params PeriodDto[] periods) =>
        client.PutAsJsonAsync("/api/admin/opening-hours", new OpeningHoursDto(periods), Token);

    private static async Task SetLocationAsync(HttpClient client, string countryCode, string? regionCode)
    {
        var response = await client.PutAsJsonAsync("/api/admin/location", new LocationRequest(countryCode, regionCode), Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<List<HolidayResponse>> Holidays2026Async(HttpClient client) =>
        (await client.GetFromJsonAsync<List<HolidayResponse>>("/api/admin/holidays?from=2026-01-01&to=2026-12-31", Token))!;

    [Theory]
    [InlineData("GET", "/api/admin/opening-hours")]
    [InlineData("PUT", "/api/admin/opening-hours")]
    [InlineData("GET", "/api/admin/location")]
    [InlineData("PUT", "/api/admin/location")]
    [InlineData("GET", "/api/admin/holidays")]
    [InlineData("PUT", "/api/admin/holidays/2026-06-04")]
    public async Task Front_desk_users_get_403(string method, string path)
    {
        using var client = await LoginAsync("frontdesk@zur-linde.test");

        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "PUT")
        {
            request.Content = JsonContent.Create(new { });
        }
        var response = await client.SendAsync(request, Token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Opening_hours_are_saved_for_the_whole_week()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var put = await PutHoursAsync(client,
            new PeriodDto(DayOfWeek.Friday, "17:30", "24:00"),
            new PeriodDto(DayOfWeek.Friday, "11:30", "14:30"),
            new PeriodDto(DayOfWeek.Monday, "09:00", "17:00"),
            // Touching windows do not overlap.
            new PeriodDto(DayOfWeek.Saturday, "10:00", "14:00"),
            new PeriodDto(DayOfWeek.Saturday, "14:00", "18:00"));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var hours = await client.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Token);
        Assert.Equal(
        [
            new PeriodDto(DayOfWeek.Monday, "09:00", "17:00"),
            new PeriodDto(DayOfWeek.Friday, "11:30", "14:30"),
            new PeriodDto(DayOfWeek.Friday, "17:30", "24:00"),
            new PeriodDto(DayOfWeek.Saturday, "10:00", "14:00"),
            new PeriodDto(DayOfWeek.Saturday, "14:00", "18:00"),
        ], hours!.Periods!);

        // Saving again replaces the week.
        await PutHoursAsync(client, new PeriodDto(DayOfWeek.Sunday, "12:00", "15:00"));
        hours = await client.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Token);
        Assert.Equal([new PeriodDto(DayOfWeek.Sunday, "12:00", "15:00")], hours!.Periods!);
    }

    [Theory]
    [InlineData("11:00", "15:00", "14:00", "18:00", "overlapping_periods")]
    [InlineData("11:00", "15:00", "12:00", "13:00", "overlapping_periods")]
    [InlineData("11:00", "15:00", "11:00", "15:00", "overlapping_periods")]
    [InlineData("15:00", "15:00", "17:00", "18:00", "start_not_before_end")]
    [InlineData("11:00", "15:00", "18:00", "17:00", "start_not_before_end")]
    [InlineData("11:00", "15:00", "17:00", "24:01", "invalid_time")]
    [InlineData("24:00", "24:00", "17:00", "18:00", "invalid_time")]
    [InlineData("9:00", "15:00", "17:00", "18:00", "invalid_time")]
    [InlineData("", "15:00", "17:00", "18:00", "invalid_time")]
    public async Task Invalid_opening_hours_are_rejected_and_nothing_is_saved(string start1, string end1, string start2, string end2, string error)
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await PutHoursAsync(client, new PeriodDto(DayOfWeek.Tuesday, "10:00", "12:00"));

        var response = await PutHoursAsync(client,
            new PeriodDto(DayOfWeek.Wednesday, start1, end1),
            new PeriodDto(DayOfWeek.Wednesday, start2, end2));

        Assert.Equal(error, await ErrorOf(response));
        var hours = await client.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Token);
        Assert.Equal([new PeriodDto(DayOfWeek.Tuesday, "10:00", "12:00")], hours!.Periods!);
    }

    [Fact]
    public async Task Windows_on_different_days_may_have_the_same_times()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var response = await PutHoursAsync(client,
            new PeriodDto(DayOfWeek.Monday, "11:00", "15:00"),
            new PeriodDto(DayOfWeek.Tuesday, "11:00", "15:00"));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_day_of_the_week_is_rejected()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync("/api/admin/opening-hours", new { periods = new[] { new { dayOfWeek = 7, start = "10:00", end = "12:00" } } }, Token);

        Assert.Equal("invalid_day", await ErrorOf(response));
    }

    [Theory]
    [InlineData("DE", "DE-BY", "Europe/Berlin")]
    [InlineData("AT", null, "Europe/Vienna")]
    [InlineData("RS", "", "Europe/Belgrade")]
    public async Task The_location_sets_the_time_zone(string countryCode, string? regionCode, string timeZoneId)
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        await SetLocationAsync(client, countryCode, regionCode);

        var location = await client.GetFromJsonAsync<LocationResponse>("/api/admin/location", Token);
        Assert.Equal(new LocationResponse(countryCode, string.IsNullOrEmpty(regionCode) ? null : regionCode, timeZoneId), location);
    }

    [Theory]
    [InlineData("DE", null, "region_required")]
    [InlineData("DE", "", "region_required")]
    [InlineData("DE", "DE-XX", "invalid_region")]
    [InlineData("AT", "DE-BY", "region_not_allowed")]
    [InlineData("RS", "RS-00", "region_not_allowed")]
    [InlineData("FR", null, "invalid_country")]
    [InlineData(null, null, "invalid_country")]
    public async Task An_invalid_location_is_rejected(string? countryCode, string? regionCode, string error)
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync("/api/admin/location", new LocationRequest(countryCode, regionCode), Token);

        Assert.Equal(error, await ErrorOf(response));
    }

    [Fact]
    public async Task The_holidays_follow_the_federal_state()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        await SetLocationAsync(client, "DE", "DE-BY");
        var bavaria = await Holidays2026Async(client);
        Assert.Contains(bavaria, h => h.Date == new DateOnly(2026, 6, 4) && h.Keys.SequenceEqual(["corpusChristi"]) && !h.IsOpen);
        Assert.DoesNotContain(bavaria, h => h.Keys.Contains("womensDay"));

        await SetLocationAsync(client, "DE", "DE-BE");
        var berlin = await Holidays2026Async(client);
        Assert.Contains(berlin, h => h.Date == new DateOnly(2026, 3, 8) && h.Keys.SequenceEqual(["womensDay"]));
        Assert.DoesNotContain(berlin, h => h.Keys.Contains("corpusChristi"));
    }

    [Fact]
    public async Task Holidays_without_a_range_cover_the_next_12_months()
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await SetLocationAsync(client, "AT", null);

        var holidays = (await client.GetFromJsonAsync<List<HolidayResponse>>("/api/admin/holidays", Token))!;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // Every 12-month window contains Christmas Day exactly once.
        Assert.Single(holidays, h => h.Keys.Contains("christmasDay"));
        Assert.All(holidays, h => Assert.InRange(h.Date, today.AddDays(-1), today.AddYears(1)));
    }

    [Fact]
    public async Task Holidays_of_one_day_are_grouped()
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await SetLocationAsync(client, "RS", null);

        var holidays = await client.GetFromJsonAsync<List<HolidayResponse>>("/api/admin/holidays?from=2027-05-02&to=2027-05-02", Token);

        var day = Assert.Single(holidays!);
        Assert.Equal(["labourDay2", "orthodoxEaster"], day.Keys.Order());
    }

    [Theory]
    [InlineData("from=2026-12-31&to=2026-01-01")]
    [InlineData("from=2026-01-01&to=2028-01-02")]
    public async Task An_invalid_holiday_range_is_rejected(string query)
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await SetLocationAsync(client, "AT", null);

        var response = await client.GetAsync($"/api/admin/holidays?{query}", Token);

        Assert.Equal("invalid_range", await ErrorOf(response));
    }

    [Fact]
    public async Task A_holiday_can_be_opened_and_closed_again()
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await SetLocationAsync(client, "DE", "DE-BY");
        var corpusChristi = new DateOnly(2026, 6, 4);

        var open = await client.PutAsJsonAsync("/api/admin/holidays/2026-06-04", new HolidayOverrideRequest(true), Token);
        Assert.Equal(HttpStatusCode.NoContent, open.StatusCode);
        Assert.True((await Holidays2026Async(client)).Single(h => h.Date == corpusChristi).IsOpen);
        Assert.False((await Holidays2026Async(client)).Single(h => h.Date == new DateOnly(2026, 8, 15)).IsOpen);

        var close = await client.PutAsJsonAsync("/api/admin/holidays/2026-06-04", new HolidayOverrideRequest(false), Token);
        Assert.Equal(HttpStatusCode.NoContent, close.StatusCode);
        Assert.False((await Holidays2026Async(client)).Single(h => h.Date == corpusChristi).IsOpen);
    }

    [Fact]
    public async Task Only_holidays_can_be_overridden()
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await SetLocationAsync(client, "DE", "DE-BE");

        // Corpus Christi is no holiday in Berlin.
        var response = await client.PutAsJsonAsync("/api/admin/holidays/2026-06-04", new HolidayOverrideRequest(true), Token);

        Assert.Equal("not_a_holiday", await ErrorOf(response));
    }

    [Fact]
    public async Task A_tenant_admin_neither_sees_nor_changes_another_restaurants_data()
    {
        using var linde = await LoginAsync("admin@zur-linde.test");
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        await SetLocationAsync(linde, "DE", "DE-BY");
        await PutHoursAsync(linde, new PeriodDto(DayOfWeek.Thursday, "11:00", "22:00"));
        await linde.PutAsJsonAsync("/api/admin/holidays/2026-06-04", new HolidayOverrideRequest(true), Token);

        Assert.Empty((await dunav.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Token))!.Periods!);
        Assert.Equal(new LocationResponse(null, null, null), await dunav.GetFromJsonAsync<LocationResponse>("/api/admin/location", Token));
        Assert.Empty(await Holidays2026Async(dunav));

        // Dunav's changes stay with Dunav.
        await SetLocationAsync(dunav, "RS", null);
        await PutHoursAsync(dunav, new PeriodDto(DayOfWeek.Monday, "08:00", "12:00"));
        Assert.Equal("not_a_holiday", await ErrorOf(await dunav.PutAsJsonAsync("/api/admin/holidays/2026-06-04", new HolidayOverrideRequest(true), Token)));

        Assert.Equal([new PeriodDto(DayOfWeek.Thursday, "11:00", "22:00")], (await linde.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Token))!.Periods!);
        Assert.Equal(new LocationResponse("DE", "DE-BY", "Europe/Berlin"), await linde.GetFromJsonAsync<LocationResponse>("/api/admin/location", Token));
        Assert.True((await Holidays2026Async(linde)).Single(h => h.Date == new DateOnly(2026, 6, 4)).IsOpen);
        Assert.False((await Holidays2026Async(dunav)).Single(h => h.Date == new DateOnly(2026, 1, 7)).IsOpen);
    }
}
