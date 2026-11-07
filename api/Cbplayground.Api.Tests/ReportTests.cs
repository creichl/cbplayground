using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.ReportEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The reports of <c>GET /api/admin/reports</c> against an API clock that stands still at 00:30 on Wednesday, 11 March 2026 in
/// Vienna, which is still 10 March in UTC (<see cref="ReportClockApiFactory"/>).
/// </summary>
public class ReportTests(ReportTests.ReportClockApiFactory factory) : IClassFixture<ReportTests.ReportClockApiFactory>
{
    public class ReportClockApiFactory : ApiFactory
    {
        private class FixedClock(DateTimeOffset utcNow) : TimeProvider
        {
            public override DateTimeOffset GetUtcNow() => utcNow;
        }

        /// <summary>The API's today in Vienna, a Wednesday.</summary>
        public static readonly DateOnly Today = new(2026, 3, 11);

        public static readonly TimeOnly Now = new(0, 30);

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            var vienna = TimeZoneInfo.FindSystemTimeZoneById(Locations.TimeZones[Locations.Austria]);
            var utcNow = TimeZoneInfo.ConvertTimeToUtc(Today.ToDateTime(Now), vienna);
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(new DateTimeOffset(utcNow, TimeSpan.Zero))));
        }
    }

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static DateOnly Today => ReportClockApiFactory.Today;

    private static DateTime At(int days, int hour, int minute = 0) => Today.AddDays(days).ToDateTime(new TimeOnly(hour, minute));

    private static readonly TestArea[] OneRoom = [new TestArea("Saal", true, 100, ("1", 4), ("2", 4), ("3", 6))];

    private async Task<ReportResponse> GetReportAsync(TestRestaurant restaurant, string query)
    {
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var response = await admin.GetAsync($"/api/admin/reports{query}", Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReportResponse>(Token))!;
    }

    /// <summary>Marks a cancelled reservation as cancelled by the guest through the link of the booking.</summary>
    private async Task MarkCancelledByGuestAsync(TestRestaurant restaurant, Guid id)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reservation = await db.Reservations.SingleAsync(r => r.Id == id, Token);
        reservation.CancelledByGuest = true;
        await db.SaveChangesAsync(Token);
    }

    [Fact]
    public async Task The_figures_count_every_status_and_source()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        // Wednesday (today), counted: 4 reservations with 11 covers.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(0, 12), status: ReservationStatus.Confirmed, source: ReservationSource.Staff, partySize: 2);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(0, 12, 30), status: ReservationStatus.Arrived, source: ReservationSource.WalkIn, partySize: 3);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "3", At(0, 19), status: ReservationStatus.Completed, source: ReservationSource.Online, partySize: 4);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(0, 19, 45), status: ReservationStatus.Late, source: ReservationSource.Online, partySize: 2);
        // Saturday, counted: an open request for 2.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(3, 19), status: ReservationStatus.Requested, source: ReservationSource.Online, partySize: 2);
        // Not counted as reservations or covers.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(3, 19), status: ReservationStatus.NoShow, source: ReservationSource.Staff, partySize: 5);
        var byGuest = await TestRestaurants.AddReservationAsync(factory, restaurant, "3", At(3, 12), status: ReservationStatus.Cancelled, source: ReservationSource.Online, partySize: 6);
        await MarkCancelledByGuestAsync(restaurant, byGuest);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "3", At(3, 19), status: ReservationStatus.Cancelled, source: ReservationSource.Staff, partySize: 4);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(0, 13), status: ReservationStatus.Declined, source: ReservationSource.Online, partySize: 2);

        var report = await GetReportAsync(restaurant, $"?from={Today:yyyy-MM-dd}&to={Today.AddDays(6):yyyy-MM-dd}");

        Assert.Equal(Today, report.From);
        Assert.Equal(Today.AddDays(6), report.To);
        Assert.Equal(new ReportTotals(
            Reservations: 5,
            Covers: 13,
            AveragePartySize: 2.6,
            NoShows: 1,
            NoShowRate: 1.0 / 6,
            Cancellations: 2,
            CancelledByGuest: 1,
            CancelledByRestaurant: 1,
            DeclinedRequests: 1), report.Totals);
        Assert.Equal(
            [new ReportSource(ReservationSource.Online, 3, 8), new ReportSource(ReservationSource.Staff, 1, 2), new ReportSource(ReservationSource.WalkIn, 1, 3)],
            report.BySource);
        // Wednesday is 3, Saturday 6.
        Assert.Equal([0, 0, 11, 0, 0, 2, 0], report.ByWeekday.Select(d => d.Covers));
        Assert.Equal(Enumerable.Range(1, 7), report.ByWeekday.Select(d => d.Weekday));
        Assert.Equal(24, report.ByHour.Count);
        Assert.Equal(5, report.ByHour.Single(h => h.Hour == 12).Covers);
        Assert.Equal(8, report.ByHour.Single(h => h.Hour == 19).Covers);
        Assert.Equal(13, report.ByHour.Sum(h => h.Covers));
        Assert.Equal(7, report.Days.Count);
        Assert.Equal(new ReportDay(Today, 4, 11), report.Days[0]);
        Assert.Equal(new ReportDay(Today.AddDays(3), 1, 2), report.Days[3]);
        Assert.Equal(new ReportDay(Today.AddDays(1), 0, 0), report.Days[1]);
    }

    [Fact]
    public async Task An_empty_period_has_zero_figures()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);

        var report = await GetReportAsync(restaurant, $"?from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}");

        Assert.Equal(new ReportTotals(0, 0, 0, 0, 0, 0, 0, 0, 0), report.Totals);
        Assert.All(report.BySource, source => Assert.Equal(0, source.Covers));
        Assert.Equal([new ReportDay(Today, 0, 0)], report.Days);
    }

    [Fact]
    public async Task The_days_are_those_of_the_restaurants_time_zone()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        // The period is Monday to Tuesday: from its first minute to its last.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(-3, 23, 59), partySize: 1);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(-2, 0), partySize: 2);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(-1, 23, 45), partySize: 3);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(0, 0), partySize: 4);

        var report = await GetReportAsync(restaurant, $"?from={Today.AddDays(-2):yyyy-MM-dd}&to={Today.AddDays(-1):yyyy-MM-dd}");

        Assert.Equal(5, report.Totals.Covers);
        Assert.Equal([new ReportDay(Today.AddDays(-2), 1, 2), new ReportDay(Today.AddDays(-1), 1, 3)], report.Days);
        Assert.Equal(2, report.ByHour.Single(h => h.Hour == 0).Covers);
        Assert.Equal(3, report.ByHour.Single(h => h.Hour == 23).Covers);
    }

    [Fact]
    public async Task Without_a_period_it_reports_the_last_30_days_up_to_today_in_the_restaurants_time_zone()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        // Today in Vienna, though still yesterday in UTC.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(0, 0, 15), partySize: 2);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(-29, 12), partySize: 3);
        // Before the 30 days and after today.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(-30, 12), partySize: 4);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(1, 12), partySize: 5);

        var report = await GetReportAsync(restaurant, "");

        Assert.Equal(Today, report.To);
        Assert.Equal(Today.AddDays(-29), report.From);
        Assert.Equal(30, report.Days.Count);
        Assert.Equal(5, report.Totals.Covers);
        Assert.Equal(new ReportDay(Today, 1, 2), report.Days[^1]);

        var withFrom = await GetReportAsync(restaurant, $"?from={Today.AddDays(-30):yyyy-MM-dd}");
        Assert.Equal(Today, withFrom.To);
        Assert.Equal(9, withFrom.Totals.Covers);
    }

    [Fact]
    public async Task A_restaurant_sees_only_its_own_reservations()
    {
        var own = await TestRestaurants.CreateAsync(factory, OneRoom);
        var other = await TestRestaurants.CreateAsync(factory, OneRoom);
        await TestRestaurants.AddReservationAsync(factory, own, "1", At(-1, 19), partySize: 2);
        await TestRestaurants.AddReservationAsync(factory, other, "1", At(-1, 19), partySize: 6);
        await TestRestaurants.AddReservationAsync(factory, other, "2", At(-1, 19), status: ReservationStatus.NoShow, partySize: 4);

        var report = await GetReportAsync(own, $"?from={Today.AddDays(-1):yyyy-MM-dd}&to={Today:yyyy-MM-dd}");

        Assert.Equal(new ReportTotals(1, 2, 2, 0, 0, 0, 0, 0, 0), report.Totals);
        var ofOther = await GetReportAsync(other, $"?from={Today.AddDays(-1):yyyy-MM-dd}&to={Today:yyyy-MM-dd}");
        Assert.Equal(6, ofOther.Totals.Covers);
        Assert.Equal(1, ofOther.Totals.NoShows);
    }

    [Fact]
    public async Task Front_desk_users_get_403_and_anonymous_requests_401()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var anonymous = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.GetAsync("/api/admin/reports", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/reports", Token)).StatusCode);
    }

    [Theory]
    [InlineData("?from=2026-03-11&to=2026-03-10")]
    [InlineData("?from=2025-03-09&to=2026-03-10")]
    public async Task A_reversed_period_or_one_longer_than_366_days_is_400(string query)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        var response = await admin.GetAsync($"/api/admin/reports{query}", Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_range", (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))!.Error);
    }

    [Fact]
    public async Task A_period_of_366_days_is_allowed()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);

        var report = await GetReportAsync(restaurant, "?from=2025-03-11&to=2026-03-11");

        Assert.Equal(366, report.Days.Count);
    }
}
