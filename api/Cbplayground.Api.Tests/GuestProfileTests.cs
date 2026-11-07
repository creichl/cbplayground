using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.Reservations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.GuestEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The guest profiles: matching the reservations, the figures, the directory, editing and deleting. Every test creates a restaurant of its own.</summary>
public class GuestProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6), ("4", 4), ("5", 4))];

    /// <summary>A staff reservation at 18:00 on <paramref name="date"/>, at the next table that is still free.</summary>
    private static async Task<ReservationResponse> CreateAsync(HttpClient client, DateOnly date, string name, string? phone = null, string? email = null,
        string? notes = null, string? occasion = null, string time = "18:00")
    {
        var response = await client.PostAsJsonAsync("/api/staff/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests = 2, name, phone, email, notes, occasion }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> BookAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string name, string? phone,
        string? email = null, string? occasion = null, string time = "19:00") =>
        client.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests = 2, name, phone, email, language = "de", occasion }, Token);

    private static async Task<List<ReservationResponse>> ListAsync(HttpClient client, DateOnly date) =>
        (await client.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token))!;

    private static async Task<GuestDetail> GuestAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<GuestDetail>($"/api/staff/guests/{id}", Token))!;

    private static Task<HttpResponseMessage> UpdateGuestAsync(HttpClient client, Guid id, string name, string? phone = null, string? email = null,
        string? notes = null, string? allergyNotes = null, string[]? tags = null) =>
        client.PutAsJsonAsync($"/api/staff/guests/{id}", new { name, phone, email, notes, allergyNotes, tags }, Token);

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private List<Guest> GuestsOf(TestRestaurant restaurant)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        return scope.ServiceProvider.GetRequiredService<AppDbContext>().Guests.AsNoTracking().ToList();
    }

    /// <summary>Adds a reservation directly (e.g. one in the past) and links it to the guest.</summary>
    private async Task<Guid> AddForGuestAsync(TestRestaurant restaurant, Guid guestId, string tableNumber, DateTime startLocal, ReservationStatus status)
    {
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, tableNumber, startLocal, status: status,
            completedAtLocal: status == ReservationStatus.Completed ? startLocal.AddHours(2) : null);
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Reservations.SingleAsync(r => r.Id == id, Token)).GuestId = guestId;
        await db.SaveChangesAsync(Token);
        return id;
    }

    [Theory]
    [InlineData("GET", "/api/staff/guests")]
    [InlineData("GET", "/api/staff/guests/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", "/api/staff/guests/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", "/api/staff/guests/00000000-0000-0000-0000-000000000001")]
    public async Task Guest_endpoints_need_a_sign_in_of_restaurant_staff(string method, string path)
    {
        using var anonymous = factory.CreateHttpsClient();
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await superadmin.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
    }

    [Theory]
    [InlineData("+43 660 1234567", "AT", "+436601234567")]
    [InlineData("0043 660/1234567", "AT", "+436601234567")]
    [InlineData("0660 123-45-67", "AT", "+436601234567")]
    [InlineData("(0660) 1234567", "AT", "+436601234567")]
    [InlineData("0151 2345678", "DE", "+491512345678")]
    [InlineData("064 1234567", "RS", "+381641234567")]
    [InlineData("0660 1234567", null, "06601234567")]
    [InlineData("660 1234567", "AT", "6601234567")]
    [InlineData(" ", "AT", null)]
    [InlineData(null, "AT", null)]
    public void Phone_numbers_are_normalised_with_the_country_code_where_it_is_known(string? phone, string? countryCode, string? expected)
    {
        Assert.Equal(expected, GuestProfiles.NormalizePhone(phone, countryCode));
    }

    [Fact]
    public async Task A_phone_number_in_different_formats_finds_the_same_guest_on_every_channel()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        var first = await CreateAsync(frontDesk, date, "Eva Gast", phone: "+43 660 1234567");
        Assert.Equal(HttpStatusCode.Created, (await BookAsync(anonymous, restaurant, date, "Eva G.", "0660/123 45 67")).StatusCode);
        var second = await CreateAsync(frontDesk, date, "Eva", phone: "0043 660 1234567", time: "12:00");

        var guest = Assert.Single(GuestsOf(restaurant));
        Assert.Equal(("Eva Gast", "+436601234567"), (guest.Name, guest.Phone));
        Assert.All(await ListAsync(frontDesk, date), r => Assert.Equal(guest.Id, r.GuestId));
        Assert.Equal(guest.Id, first.GuestId);
        Assert.Equal(guest.Id, second.GuestId);
    }

    [Fact]
    public async Task An_email_address_finds_the_guest_whatever_its_case_and_fills_in_what_the_profile_lacks()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var first = await CreateAsync(frontDesk, date, "Eva Gast", email: "Eva.Gast@Example.com");
        var second = await CreateAsync(frontDesk, date, "Eva Anders", email: "eva.gast@example.COM", phone: "+43 660 7654321");

        var guest = Assert.Single(GuestsOf(restaurant));
        Assert.Equal(guest.Id, first.GuestId);
        Assert.Equal(guest.Id, second.GuestId);
        // The name stays, the missing phone number is filled in, the email address is stored in lower case.
        Assert.Equal(("Eva Gast", "+436607654321", "eva.gast@example.com"), (guest.Name, guest.Phone, guest.Email));
    }

    [Fact]
    public async Task The_phone_number_is_matched_before_the_email_address_and_a_contact_of_another_guest_is_not_taken_over()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var anna = await CreateAsync(frontDesk, date, "Anna", phone: "+43 660 1111111");
        var bert = await CreateAsync(frontDesk, date, "Bert", email: "bert@example.com");
        // Anna's phone number with Bert's email address: Anna, who keeps her profile without Bert's address.
        var both = await CreateAsync(frontDesk, date, "Anna", phone: "+43 660 1111111", email: "bert@example.com");

        Assert.Equal(anna.GuestId, both.GuestId);
        Assert.NotEqual(anna.GuestId, bert.GuestId);
        var guests = GuestsOf(restaurant);
        Assert.Equal(2, guests.Count);
        Assert.Null(guests.Single(g => g.Id == anna.GuestId).Email);
    }

    [Fact]
    public async Task A_reservation_without_contact_gets_no_guest_and_a_walk_in_with_a_phone_number_gets_one()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, hours: Enum.GetValues<DayOfWeek>()
            .Select(d => (d, new TimeOnly(0, 0), OpeningPeriod.EndOfDay)).ToArray());
        await TestRestaurants.OpenOnHolidayAsync(factory, restaurant, TestRestaurant.Today);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var withoutContact = await CreateAsync(frontDesk, date, "Ohne Kontakt");
        var walkIn = await frontDesk.PostAsJsonAsync("/api/staff/walk-ins", new { guests = 2, phone = "+43 660 2222222" }, Token);
        Assert.Equal(HttpStatusCode.Created, walkIn.StatusCode);
        var seated = (await walkIn.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        var later = await CreateAsync(frontDesk, date, "Maria Huber", phone: "0660 2222222", time: "12:00");

        Assert.Null(withoutContact.GuestId);
        Assert.Null(withoutContact.Guest);
        Assert.NotNull(seated.GuestId);
        Assert.Equal(seated.GuestId, later.GuestId);
        // The walk-in had no name; the name of the next reservation replaces "Walk-in".
        Assert.Equal("Maria Huber", Assert.Single(GuestsOf(restaurant)).Name);
    }

    [Fact]
    public async Task Guests_are_not_matched_across_restaurants()
    {
        var linde = await TestRestaurants.CreateAsync(factory, OneRoom);
        var dunav = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var lindeDesk = await TestRestaurants.SignInAsync(factory, linde.FrontDeskEmail);
        using var dunavDesk = await TestRestaurants.SignInAsync(factory, dunav.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var inLinde = await CreateAsync(lindeDesk, date, "Eva Gast", phone: "+43 660 3333333", email: "eva@example.com");
        var inDunav = await CreateAsync(dunavDesk, date, "Eva Gast", phone: "+43 660 3333333", email: "eva@example.com");

        Assert.NotEqual(inLinde.GuestId, inDunav.GuestId);
        Assert.Single(GuestsOf(linde));
        Assert.Single(GuestsOf(dunav));
        Assert.Equal(HttpStatusCode.NotFound, (await dunavDesk.GetAsync($"/api/staff/guests/{inLinde.GuestId}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await UpdateGuestAsync(dunavDesk, inLinde.GuestId!.Value, "Fremd")).StatusCode);
        var page = (await dunavDesk.GetFromJsonAsync<GuestPage>("/api/staff/guests", Token))!;
        Assert.Equal([inDunav.GuestId!.Value], page.Items.Select(g => g.Id));
    }

    [Fact]
    public async Task The_profile_counts_visits_no_shows_and_cancellations_and_names_the_last_and_next_visit()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var upcoming = await CreateAsync(frontDesk, date, "Stammgast", phone: "+43 660 4444444");
        var guestId = upcoming.GuestId!.Value;
        var today = TestRestaurant.Today.ToDateTime(new TimeOnly(0, 0));
        await AddForGuestAsync(restaurant, guestId, "1", today.AddDays(-20).AddHours(19), ReservationStatus.Completed);
        await AddForGuestAsync(restaurant, guestId, "1", today.AddDays(-10).AddHours(19), ReservationStatus.Completed);
        await AddForGuestAsync(restaurant, guestId, "1", today.AddDays(-5).AddHours(19), ReservationStatus.NoShow);
        await AddForGuestAsync(restaurant, guestId, "1", today.AddDays(-3).AddHours(19), ReservationStatus.Cancelled);

        var guest = await GuestAsync(frontDesk, guestId);

        Assert.Equal(new GuestFigures(2, 1, 1, DateOnly.FromDateTime(today.AddDays(-10)), date), guest.Figures);
        Assert.Equal(5, guest.Reservations.Count);
        Assert.Equal(guest.Reservations.Select(r => r.Date).OrderDescending(), guest.Reservations.Select(r => r.Date));
        var summary = Assert.Single(await ListAsync(frontDesk, date)).Guest!;
        Assert.Equal((2, 1, false), (summary.Visits, summary.NoShows, summary.HasAllergies));
        var listed = Assert.Single((await frontDesk.GetFromJsonAsync<GuestPage>("/api/staff/guests", Token))!.Items);
        Assert.Equal((2, 1, DateOnly.FromDateTime(today.AddDays(-10))), (listed.Visits, listed.NoShows, listed.LastVisit));
    }

    [Fact]
    public async Task The_staff_edit_notes_allergies_and_tags_and_a_contact_of_another_guest_is_refused()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var anna = (await CreateAsync(frontDesk, date, "Anna", phone: "+43 660 5555555", email: "anna@example.com")).GuestId!.Value;
        var bert = await CreateAsync(frontDesk, date, "Bert", phone: "+43 660 6666666");

        Assert.Equal("guest_contact_taken", await ErrorOf(await UpdateGuestAsync(frontDesk, bert.GuestId!.Value, "Bert", phone: "0660 555 5555"), HttpStatusCode.Conflict));
        Assert.Equal("guest_contact_taken", await ErrorOf(await UpdateGuestAsync(frontDesk, bert.GuestId!.Value, "Bert", email: "ANNA@example.com"), HttpStatusCode.Conflict));
        Assert.Equal("invalid_tags", await ErrorOf(await UpdateGuestAsync(frontDesk, anna, "Anna", tags: ["Vip", "Gold"]), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_notes", await ErrorOf(await UpdateGuestAsync(frontDesk, anna, "Anna", notes: new string('x', 1001)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_allergy_notes", await ErrorOf(await UpdateGuestAsync(frontDesk, anna, "Anna", allergyNotes: new string('x', 501)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_name", await ErrorOf(await UpdateGuestAsync(frontDesk, anna, " "), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_phone", await ErrorOf(await UpdateGuestAsync(frontDesk, anna, "Anna", phone: "12"), HttpStatusCode.BadRequest));

        var response = await UpdateGuestAsync(frontDesk, anna, "Anna Berger", phone: "+43 660 5555555", email: "Anna.Berger@Example.com",
            notes: "Mag den Ecktisch", allergyNotes: "Laktose", tags: ["Regular", "Vip", "Vip"]);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var guest = (await response.Content.ReadFromJsonAsync<GuestDetail>(Token))!;
        Assert.Equal(("Anna Berger", "+436605555555", "anna.berger@example.com", "Mag den Ecktisch", "Laktose"),
            (guest.Name, guest.Phone, guest.Email, guest.Notes, guest.AllergyNotes));
        Assert.Equal([GuestTag.Vip, GuestTag.Regular], guest.Tags);
        var summary = (await ListAsync(frontDesk, date)).Single(r => r.GuestId == anna).Guest!;
        Assert.Equal([GuestTag.Vip, GuestTag.Regular], summary.Tags);
        Assert.True(summary.HasAllergies);
        // The reservation keeps the details it was made with.
        Assert.Equal("Anna", (await ListAsync(frontDesk, date)).Single(r => r.GuestId == anna).Name);
    }

    [Fact]
    public async Task A_change_of_a_reservation_keeps_its_guest_after_the_profile_s_contact_was_changed_and_rematches_on_a_new_contact()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await CreateAsync(frontDesk, date, "Eva Gast", phone: "+43 660 1717171", email: "eva@example.com");
        var guestId = reservation.GuestId!.Value;
        Assert.Equal(HttpStatusCode.OK, (await UpdateGuestAsync(frontDesk, guestId, "Eva Gast", phone: "+43 664 2828282", email: "eva.neu@example.com",
            tags: ["Vip"])).StatusCode);

        // A change of the note, with the reservation's old contact in another format: the reservation stays with the edited profile.
        var body = new
        {
            date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 2, tableIds = reservation.TableIds, name = "Eva Gast", phone = "0660 1717171",
            email = "EVA@example.com", notes = "Fensterplatz", occasion = "Birthday",
        };
        var changed = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{reservation.Id}", body, Token);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var kept = (await changed.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal(guestId, kept.GuestId);
        Assert.Equal([GuestTag.Vip], kept.Guest!.Tags);
        Assert.Single(GuestsOf(restaurant));

        // A new phone number is matched again: here a new guest.
        var moved = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{reservation.Id}", body with { phone = "+43 676 3939393", email = (string?)null }, Token);
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        Assert.NotEqual(guestId, (await moved.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.GuestId);
        Assert.Equal(2, GuestsOf(restaurant).Count);
    }

    [Fact]
    public async Task The_directory_searches_name_email_and_phone_digits()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        await CreateAsync(frontDesk, date, "Lena Lindner", phone: "+43 660 7777777");
        await CreateAsync(frontDesk, date, "Paul Gruber", email: "paul.gruber@example.com");
        await CreateAsync(frontDesk, date, "Sabine Moser", phone: "+43 664 1231231", email: "sabine@example.com");

        async Task<string[]> SearchAsync(string search) =>
            (await frontDesk.GetFromJsonAsync<GuestPage>($"/api/staff/guests?search={Uri.EscapeDataString(search)}", Token))!.Items.Select(g => g.Name).ToArray();

        Assert.Equal(["Lena Lindner", "Paul Gruber", "Sabine Moser"], await SearchAsync(""));
        Assert.Equal(["Lena Lindner"], await SearchAsync("lind"));
        Assert.Equal(["Paul Gruber"], await SearchAsync("GRUBER@"));
        Assert.Equal(["Lena Lindner"], await SearchAsync("0660 777"));
        Assert.Equal(["Sabine Moser"], await SearchAsync("1231231"));
        Assert.Empty(await SearchAsync("100%"));
        // Guests who have not come yet have no last visit.
        var all = (await frontDesk.GetFromJsonAsync<GuestPage>("/api/staff/guests", Token))!;
        Assert.All(all.Items, g => Assert.Equal((0, null), (g.Visits, g.LastVisit)));
        Assert.Contains("\"lastVisit\":null", await frontDesk.GetStringAsync("/api/staff/guests", Token));
        var page = (await frontDesk.GetFromJsonAsync<GuestPage>("/api/staff/guests?page=2", Token))!;
        Assert.Equal((3, 2, GuestEndpoints.PageSize), (page.Total, page.Page, page.PageSize));
        Assert.Empty(page.Items);
    }

    [Fact]
    public async Task Deleting_a_guest_anonymises_their_reservations_and_their_history()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var first = await CreateAsync(admin, date, "Eva Gast", phone: "+43 660 8888888", email: "eva@example.com", notes: "Fensterplatz", occasion: "Birthday");
        var changed = await admin.PutAsJsonAsync($"/api/staff/reservations/{first.Id}", new
        {
            date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 1, tableIds = first.TableIds, name = "Eva Maria Gast", phone = "+43 660 8888888",
            email = "eva@example.com", notes = "Fensterplatz",
        }, Token);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var nameOnly = await admin.PutAsJsonAsync($"/api/staff/reservations/{first.Id}", new
        {
            date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 1, tableIds = first.TableIds, name = "Eva Gast", phone = "+43 660 8888888",
            email = "eva@example.com", notes = "Fensterplatz",
        }, Token);
        Assert.Equal(HttpStatusCode.OK, nameOnly.StatusCode);
        var second = await CreateAsync(admin, date, "Eva", phone: "0660 8888888", time: "12:00");
        var other = await CreateAsync(admin, date, "Anderer Gast", phone: "+43 660 9999999");
        var guestId = first.GuestId!.Value;

        var response = await admin.DeleteAsync($"/api/staff/guests/{guestId}", Token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/staff/guests/{guestId}", Token)).StatusCode);
        var reservations = await ListAsync(admin, date);
        foreach (var id in new[] { first.Id, second.Id })
        {
            var reservation = reservations.Single(r => r.Id == id);
            Assert.Equal((Reservation.DeletedGuestName, null, null, null, null), (reservation.Name, reservation.Phone, reservation.Email, reservation.Notes, reservation.GuestId));
        }
        // What the restaurant keeps: the booking itself and the occasion.
        Assert.Equal((1, Occasion.Birthday), (reservations.Single(r => r.Id == first.Id).Guests, reservations.Single(r => r.Id == first.Id).Occasion));
        Assert.Equal("Anderer Gast", reservations.Single(r => r.Id == other.Id).Name);
        var history = (await admin.GetFromJsonAsync<List<ReservationEventResponse>>($"/api/staff/reservations/{first.Id}/history", Token))!;
        Assert.DoesNotContain(history.SelectMany(e => e.Changes), c => c.Field is ReservationField.Name or ReservationField.Phone or ReservationField.Email or ReservationField.Notes);
        // The change of the party size stays, the change of nothing but the name is gone.
        Assert.Equal([ReservationEventKind.Updated, ReservationEventKind.Created], history.Select(e => e.Kind));
        Assert.Equal(ReservationField.PartySize, Assert.Single(history[0].Changes).Field);
        Assert.Single(GuestsOf(restaurant));
        // A new reservation with the same phone number makes a new profile.
        var again = await CreateAsync(admin, date, "Eva Gast", phone: "+43 660 8888888", time: "12:30");
        Assert.NotEqual(guestId, again.GuestId);
    }

    [Fact]
    public async Task The_front_desk_cannot_delete_a_guest()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var reservation = await CreateAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "Eva Gast", phone: "+43 660 1212121");

        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.DeleteAsync($"/api/staff/guests/{reservation.GuestId}", Token)).StatusCode);
        Assert.Single(GuestsOf(restaurant));
    }

    [Fact]
    public async Task An_online_booking_and_a_staff_reservation_carry_their_occasion()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal("invalid_occasion", await ErrorOf(await BookAsync(anonymous, restaurant, date, "Eva", "+43 660 1313131", occasion: "Wedding"), HttpStatusCode.BadRequest));
        Assert.Equal(HttpStatusCode.Created, (await BookAsync(anonymous, restaurant, date, "Eva", "+43 660 1313131", occasion: "Birthday")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await BookAsync(anonymous, restaurant, date, "Ohne Anlass", "+43 660 1414141", time: "17:00")).StatusCode);
        var staff = await CreateAsync(frontDesk, date, "Firma", phone: "+43 660 1515151", occasion: "Business");
        var invalid = await frontDesk.PostAsJsonAsync("/api/staff/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time = "12:00", guests = 2, name = "X", occasion = "birthday" }, Token);
        Assert.Equal("invalid_occasion", await ErrorOf(invalid, HttpStatusCode.BadRequest));

        var list = await ListAsync(frontDesk, date);
        Assert.Equal(Occasion.Birthday, list.Single(r => r.Name == "Eva").Occasion);
        Assert.Equal(Occasion.None, list.Single(r => r.Name == "Ohne Anlass").Occasion);
        Assert.Equal(Occasion.Business, staff.Occasion);

        // A change without an occasion keeps it, one with an occasion sets it, and the history records it.
        var request = new
        {
            date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 2, tableIds = staff.TableIds, name = "Firma", phone = "+43 660 1515151",
        };
        var kept = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{staff.Id}", request, Token);
        Assert.Equal(Occasion.Business, (await kept.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.Occasion);
        var set = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{staff.Id}", new
        {
            request.date, request.time, request.guests, request.tableIds, request.name, request.phone, occasion = "Anniversary",
        }, Token);
        Assert.Equal(Occasion.Anniversary, (await set.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.Occasion);
        var history = (await frontDesk.GetFromJsonAsync<List<ReservationEventResponse>>($"/api/staff/reservations/{staff.Id}/history", Token))!;
        Assert.Equal(new ReservationChangeResponse(ReservationField.Occasion, "Business", "Anniversary"), Assert.Single(history[0].Changes));
    }
}

/// <summary>The migration of the guest profiles on a database with reservations from before them.</summary>
public sealed class GuestProfilesMigrationTests : IDisposable
{
    private class NoTenant : ITenantContext
    {
        public Guid? TenantId => null;
    }

    private const string Austria = "7C5A1D0E-0000-0000-0000-0000000000A1";
    private const string Serbia = "7C5A1D0E-0000-0000-0000-0000000000B1";

    private readonly SqliteConnection connection = new("Data Source=:memory:");

    public void Dispose() => connection.Dispose();

    [Fact]
    public void Existing_reservations_get_one_guest_per_restaurant_and_phone_number_or_email_address()
    {
        connection.Open();
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options, new NoTenant());
        var migrator = db.GetService<IMigrator>();
        migrator.Migrate("20261107083146_AddPacingRules");
        Execute($"""
            INSERT INTO "Tenants" ("Id", "Name", "Slug", "CreatedAt", "IsActive", "CountryCode") VALUES
                ('{Austria}', 'Wien', 'wien', '2026-10-01 00:00:00', 1, 'AT'),
                ('{Serbia}', 'Novi Sad', 'novi-sad', '2026-10-01 00:00:00', 1, 'RS');
            INSERT INTO "Areas" ("Id", "TenantId", "Name", "SortOrder", "OnlineBookingEnabled", "OnlineCapacityPercent", "TableScale", "RoomStyle") VALUES
                ('7C5A1D0E-0000-0000-0000-0000000000A2', '{Austria}', 'Stube', 0, 1, 100, 100, 'Indoor'),
                ('7C5A1D0E-0000-0000-0000-0000000000B2', '{Serbia}', 'Sala', 0, 1, 100, 100, 'Indoor');
            INSERT INTO "Tables" ("Id", "TenantId", "AreaId", "Number", "Seats", "MinGuests", "PosX", "PosY", "Shape", "Rotation") VALUES
                ('7C5A1D0E-0000-0000-0000-0000000000A3', '{Austria}', '7C5A1D0E-0000-0000-0000-0000000000A2', '1', 4, 1, 0.5, 0.5, 'Square', 0),
                ('7C5A1D0E-0000-0000-0000-0000000000B3', '{Serbia}', '7C5A1D0E-0000-0000-0000-0000000000B2', '1', 4, 1, 0.5, 0.5, 'Square', 0);
            """);
        AddReservation(1, Austria, "Walk-in", "+43 660 1234567", null, "2026-10-01 10:00:00", "Completed");
        AddReservation(2, Austria, "Eva Gast", "0660/1234567", "Eva@Example.com", "2026-10-02 10:00:00", "NoShow");
        AddReservation(3, Austria, "Eva", "0043 660 123 45 67", null, "2026-10-03 10:00:00", "Confirmed");
        AddReservation(4, Austria, "Eva per Mail", null, "eva@example.COM", "2026-10-04 10:00:00", "Completed");
        AddReservation(5, Austria, "Bert", null, "bert@example.com", "2026-10-05 10:00:00", "Confirmed");
        AddReservation(6, Austria, "Bert", null, "BERT@example.com", "2026-10-06 10:00:00", "Cancelled");
        // Another phone number with Eva's email address: a guest of its own, without the address Eva has.
        AddReservation(7, Austria, "Carla", "+43 664 9876543", "eva@example.com", "2026-10-07 10:00:00", "Confirmed");
        AddReservation(8, Austria, "Ohne Kontakt", null, null, "2026-10-08 10:00:00", "Confirmed");
        // The same phone number in Serbia is another restaurant's guest, with the Serbian country code for a national number.
        AddReservation(9, Serbia, "Eva", "+43 660 1234567", null, "2026-10-01 10:00:00", "Confirmed");
        AddReservation(10, Serbia, "Marko", "064 1234567", null, "2026-10-02 10:00:00", "Confirmed");

        migrator.Migrate();

        Assert.Equal(3L, Execute("""SELECT COUNT(*) FROM "Guests" WHERE "TenantId" = '7C5A1D0E-0000-0000-0000-0000000000A1';"""));
        Assert.Equal(2L, Execute("""SELECT COUNT(*) FROM "Guests" WHERE "TenantId" = '7C5A1D0E-0000-0000-0000-0000000000B1';"""));
        // Eva: her phone number in three formats and her email address in two cases, named as at her first reservation with a name.
        var eva = GuestOf(1);
        Assert.NotNull(eva);
        Assert.All(new[] { 2, 3, 4 }, number => Assert.Equal(eva, GuestOf(number)));
        Assert.Equal("Eva Gast|+436601234567|eva@example.com|[]", Execute($"""SELECT "Name" || '|' || "Phone" || '|' || "Email" || '|' || "Tags" FROM "Guests" WHERE "Id" = '{eva}';"""));
        Assert.Equal(GuestOf(5), GuestOf(6));
        Assert.Equal("Bert|bert@example.com", Execute($"""SELECT "Name" || '|' || "Email" FROM "Guests" WHERE "Id" = '{GuestOf(5)}';"""));
        Assert.NotEqual(eva, GuestOf(7));
        Assert.Equal("+436649876543", Execute($"""SELECT "Phone" FROM "Guests" WHERE "Id" = '{GuestOf(7)}' AND "Email" IS NULL;"""));
        Assert.Null(GuestOf(8));
        Assert.NotEqual(eva, GuestOf(9));
        Assert.Equal("+381641234567", Execute($"""SELECT "Phone" FROM "Guests" WHERE "Id" = '{GuestOf(10)}';"""));
        Assert.Equal(0L, Execute("""SELECT COUNT(*) FROM "Reservations" WHERE "Occasion" <> 'None';"""));
        Assert.Equal(0L, Execute("""SELECT COUNT(*) FROM sqlite_master WHERE "name" = 'GuestBackfill';"""));

        // The application reads them: the profiles' ids are GUIDs as EF Core writes them.
        Assert.All(db.Guests.IgnoreQueryFilters().ToList(), g => Assert.Equal(g.Id.ToString().ToUpperInvariant(), Execute($"""SELECT "Id" FROM "Guests" WHERE "Id" = '{g.Id.ToString().ToUpperInvariant()}';""")));
        Assert.Equal(9, db.Reservations.IgnoreQueryFilters().Count(r => r.GuestId != null));
    }

    private void AddReservation(int number, string tenantId, string name, string? phone, string? email, string createdAtUtc, string status)
    {
        var table = tenantId == Austria ? "7C5A1D0E-0000-0000-0000-0000000000A3" : "7C5A1D0E-0000-0000-0000-0000000000B3";
        string Text(string? value) => value is null ? "NULL" : $"'{value}'";
        Execute($"""
            INSERT INTO "Reservations" ("Id", "TenantId", "TableId", "StartLocal", "EndLocal", "DurationMinutes", "PartySize", "GuestName", "GuestPhone", "GuestEmail",
                "Status", "Source", "ReferenceCode", "Language", "CancelledByGuest", "WasRequested", "CreatedAtUtc", "UpdatedAtUtc")
            VALUES ('{ReservationId(number)}', '{tenantId}', '{table}', '2026-12-{number:00} 18:00:00', '2026-12-{number:00} 20:00:00', 120, 2, '{name}',
                {Text(phone)}, {Text(email)}, '{status}', 'Staff', 'MIG{number:000}', 'de', 0, 0, '{createdAtUtc}', '{createdAtUtc}');
            INSERT INTO "ReservationTables" ("ReservationId", "TableId", "TenantId") VALUES ('{ReservationId(number)}', '{table}', '{tenantId}');
            """);
    }

    private static string ReservationId(int number) => $"7C5A1D0E-0000-0000-0001-{number:000000000000}";

    private string? GuestOf(int number) => Execute($"""SELECT "GuestId" FROM "Reservations" WHERE "Id" = '{ReservationId(number)}';""") as string;

    private object? Execute(string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar();
    }
}
