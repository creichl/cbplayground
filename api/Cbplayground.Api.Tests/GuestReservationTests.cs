using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.Reservations;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The guest's link to view and cancel an online reservation. Every test creates a restaurant of its own.</summary>
public class GuestReservationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 4))];

    private static string PathOf(TestRestaurant restaurant, string rest = "") => $"/api/public/restaurants/{restaurant.Slug}{rest}";

    private static DateTime LocalNow => TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Europe/Vienna");

    private static async Task<BookingResponse> BookAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time = "18:00")
    {
        var response = await client.PostAsJsonAsync(PathOf(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests = 2, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookingResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> GetAsync(HttpClient client, TestRestaurant restaurant, string code, string? token) =>
        client.GetAsync(PathOf(restaurant, $"/reservations/{code}?token={Uri.EscapeDataString(token ?? "")}"), Token);

    private static Task<HttpResponseMessage> CancelAsync(HttpClient client, TestRestaurant restaurant, string code, string? token) =>
        client.PostAsJsonAsync(PathOf(restaurant, $"/reservations/{code}/cancel"), new { token }, Token);

    /// <summary>Adds an online reservation with a token directly, e.g. one that has already started, which the API does not accept.</summary>
    private async Task<(string Code, string Token)> AddWithTokenAsync(TestRestaurant restaurant, DateTime startLocal, ReservationStatus status)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var (token, hash) = ManageToken.Create();
        var reservation = new Reservation
        {
            TableId = restaurant.Tables["1"],
            StartLocal = startLocal,
            EndLocal = startLocal.AddMinutes(120),
            DurationMinutes = 120,
            PartySize = 2,
            GuestName = "Eva Gast",
            GuestPhone = "+43 660 1234567",
            Status = status,
            Source = ReservationSource.Online,
            ReferenceCode = await ReferenceCode.GenerateUniqueAsync(db, Token),
            Language = "de",
            ManageTokenHash = hash,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync(Token);
        return (reservation.ReferenceCode, token);
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    [Fact]
    public async Task The_booking_returns_a_token_that_opens_the_reservation_in_another_client()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var bookingClient = factory.CreateHttpsClient();
        using var otherClient = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        var booking = await BookAsync(bookingClient, restaurant, date);
        var response = await GetAsync(otherClient, restaurant, booking.ReferenceCode, booking.ManageToken);

        Assert.Matches("^[A-Za-z0-9_-]{43}$", booking.ManageToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reservation = (await response.Content.ReadFromJsonAsync<GuestReservationResponse>(Token))!;
        Assert.Equal(
            (booking.ReferenceCode, ReservationStatus.Confirmed, date, "18:00", "20:00", 2, 120, "Gaststube", "1", "Eva Gast", false, true),
            (reservation.ReferenceCode, reservation.Status, reservation.Date, reservation.Time, reservation.EndTime, reservation.Guests,
                reservation.DurationMinutes, reservation.Area, reservation.TableNumber, reservation.Name, reservation.CancelledByGuest, reservation.CanCancel));
    }

    [Fact]
    public async Task A_wrong_token_or_code_is_404_without_telling_which()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory));
        var otherToken = ManageToken.Create().Token;

        var responses = new[]
        {
            await GetAsync(anonymous, restaurant, booking.ReferenceCode, otherToken),
            await GetAsync(anonymous, restaurant, booking.ReferenceCode, null),
            await GetAsync(anonymous, restaurant, booking.ReferenceCode, "not-a-token"),
            await GetAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken[..^1]),
            await GetAsync(anonymous, restaurant, "ZZZZZZ", booking.ManageToken),
            await CancelAsync(anonymous, restaurant, booking.ReferenceCode, otherToken),
            await CancelAsync(anonymous, restaurant, booking.ReferenceCode, null),
            await CancelAsync(anonymous, restaurant, "ZZZZZZ", booking.ManageToken),
        };

        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("", await response.Content.ReadAsStringAsync(Token));
        }
        // Nothing was cancelled.
        var reservation = await (await GetAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken)).Content.ReadFromJsonAsync<GuestReservationResponse>(Token);
        Assert.Equal(ReservationStatus.Confirmed, reservation!.Status);
    }

    [Fact]
    public async Task A_reservation_entered_by_staff_has_no_link()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var anonymous = factory.CreateHttpsClient();
        var created = await frontDesk.PostAsJsonAsync("/api/staff/reservations",
            new { date = $"{TestRestaurants.NextOpenDay(factory):yyyy-MM-dd}", time = "18:00", guests = 2, name = "Telefon Gast" }, Token);
        var reservation = (await created.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;

        Assert.Equal(HttpStatusCode.NotFound, (await GetAsync(anonymous, restaurant, reservation.ReferenceCode, ManageToken.Create().Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await CancelAsync(anonymous, restaurant, reservation.ReferenceCode, "")).StatusCode);
    }

    [Fact]
    public async Task The_guest_cancels_the_table_is_free_again_and_the_staff_see_who_cancelled()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var booking = await BookAsync(anonymous, restaurant, date);

        var response = await CancelAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = (await response.Content.ReadFromJsonAsync<GuestReservationResponse>(Token))!;
        Assert.Equal((ReservationStatus.Cancelled, true, false), (cancelled.Status, cancelled.CancelledByGuest, cancelled.CanCancel));
        // The only table is free again.
        await BookAsync(anonymous, restaurant, date);
        var list = await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);
        var byGuest = Assert.Single(list!, r => r.ReferenceCode == booking.ReferenceCode);
        Assert.Equal((ReservationStatus.Cancelled, true), (byGuest.Status, byGuest.CancelledByGuest));
        Assert.All(list!.Where(r => r.ReferenceCode != booking.ReferenceCode), r => Assert.False(r.CancelledByGuest));
        // A second cancellation is not possible.
        Assert.Equal("cancellation_not_possible",
            await ErrorOf(await CancelAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_cancellation_by_staff_is_not_one_by_the_guest()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var booking = await BookAsync(anonymous, restaurant, date);
        var list = await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);

        var response = await frontDesk.PostAsJsonAsync($"/api/staff/reservations/{list!.Single().Id}/status", new { status = "Cancelled" }, Token);

        var reservation = (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal((ReservationStatus.Cancelled, false), (reservation.Status, reservation.CancelledByGuest));
        var guestView = await (await GetAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken)).Content.ReadFromJsonAsync<GuestReservationResponse>(Token);
        Assert.Equal((ReservationStatus.Cancelled, false, false), (guestView!.Status, guestView.CancelledByGuest, guestView.CanCancel));
    }

    [Fact]
    public async Task A_request_can_be_cancelled_by_the_guest()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, confirmationMode: ConfirmationMode.Request);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory));

        var response = await CancelAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(ReservationStatus.Cancelled, (await response.Content.ReadFromJsonAsync<GuestReservationResponse>(Token))!.Status);
    }

    [Theory]
    [InlineData(ReservationStatus.Confirmed, true)]
    [InlineData(ReservationStatus.Late, true)]
    [InlineData(ReservationStatus.Requested, true)]
    [InlineData(ReservationStatus.Arrived, false)]
    [InlineData(ReservationStatus.Declined, false)]
    [InlineData(ReservationStatus.Cancelled, false)]
    public async Task Before_the_start_only_open_reservations_can_be_cancelled(ReservationStatus status, bool cancellable)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var (code, token) = await AddWithTokenAsync(restaurant, LocalNow.AddHours(1), status);

        var view = await (await GetAsync(anonymous, restaurant, code, token)).Content.ReadFromJsonAsync<GuestReservationResponse>(Token);
        var response = await CancelAsync(anonymous, restaurant, code, token);

        Assert.Equal(cancellable, view!.CanCancel);
        if (cancellable)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        else
        {
            Assert.Equal("cancellation_not_possible", await ErrorOf(response, HttpStatusCode.Conflict));
        }
    }

    [Theory]
    [InlineData(ReservationStatus.Confirmed)]
    [InlineData(ReservationStatus.Late)]
    public async Task From_the_start_on_the_guest_can_no_longer_cancel(ReservationStatus status)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var (code, token) = await AddWithTokenAsync(restaurant, LocalNow.AddMinutes(-1), status);

        var view = await (await GetAsync(anonymous, restaurant, code, token)).Content.ReadFromJsonAsync<GuestReservationResponse>(Token);
        var response = await CancelAsync(anonymous, restaurant, code, token);

        Assert.False(view!.CanCancel);
        Assert.Equal("cancellation_not_possible", await ErrorOf(response, HttpStatusCode.Conflict));
        var after = await (await GetAsync(anonymous, restaurant, code, token)).Content.ReadFromJsonAsync<GuestReservationResponse>(Token);
        Assert.Equal((status, false), (after!.Status, after.CancelledByGuest));
    }

    [Fact]
    public async Task The_right_code_and_token_under_another_restaurants_slug_is_404()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        var other = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory));

        Assert.Equal(HttpStatusCode.NotFound, (await GetAsync(anonymous, other, booking.ReferenceCode, booking.ManageToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await CancelAsync(anonymous, other, booking.ReferenceCode, booking.ManageToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await anonymous.GetAsync($"/api/public/restaurants/no-such-restaurant/reservations/{booking.ReferenceCode}?token={booking.ManageToken}", Token)).StatusCode);

        // The reservation stays as it was.
        var view = await (await GetAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken)).Content.ReadFromJsonAsync<GuestReservationResponse>(Token);
        Assert.Equal(ReservationStatus.Confirmed, view!.Status);
    }

    [Fact]
    public async Task A_signed_in_admin_of_another_restaurant_cannot_reach_the_reservation_through_their_own_slug()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        var other = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var otherAdmin = await TestRestaurants.SignInAsync(factory, other.AdminEmail);
        var booking = await BookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory));

        Assert.Equal(HttpStatusCode.NotFound, (await GetAsync(otherAdmin, other, booking.ReferenceCode, booking.ManageToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await CancelAsync(otherAdmin, other, booking.ReferenceCode, booking.ManageToken)).StatusCode);
        // Under the right slug the link works for everyone who has it, signed in or not.
        Assert.Equal(HttpStatusCode.OK, (await GetAsync(otherAdmin, restaurant, booking.ReferenceCode, booking.ManageToken)).StatusCode);
    }
}

/// <summary>The guest's reservation link with the real rate limit of 10 requests per client in 10 minutes.</summary>
public class GuestReservationRateLimitTests(PublicBookingRateLimitTests.RateLimitedApiFactory factory) : IClassFixture<PublicBookingRateLimitTests.RateLimitedApiFactory>
{
    [Fact]
    public async Task The_eleventh_request_within_10_minutes_is_answered_with_429()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        var path = $"/api/public/restaurants/{restaurant.Slug}/reservations/ZZZZZZ";

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{path}?token=x", TestContext.Current.CancellationToken)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound,
                (await anonymous.PostAsJsonAsync($"{path}/cancel", new { token = "x" }, TestContext.Current.CancellationToken)).StatusCode);
        }
        var limited = await anonymous.GetAsync($"{path}?token=x", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }
}
