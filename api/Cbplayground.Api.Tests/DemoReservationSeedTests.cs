using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Cbplayground.Api.Tests;

/// <summary>The demo reservations of the Development environment, on a factory of their own (the seed covers every restaurant).</summary>
public class DemoReservationSeedTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private List<Reservation> ReservationsOf(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenantId;
        return scope.ServiceProvider.GetRequiredService<AppDbContext>().Reservations.AsNoTracking().ToList();
    }

    private List<ReservationEvent> EventsOf(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenantId;
        return scope.ServiceProvider.GetRequiredService<AppDbContext>().ReservationEvents.AsNoTracking().ToList();
    }

    private List<Guest> GuestsOf(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenantId;
        return scope.ServiceProvider.GetRequiredService<AppDbContext>().Guests.AsNoTracking().ToList();
    }

    [Fact]
    public async Task Demo_reservations_belong_to_guest_profiles_some_with_several_visits_and_one_with_an_allergy()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2), ("3", 4), ("4", 4), ("5", 6), ("6", 4), ("7", 4))]);

        await DevelopmentSeed.SeedReservationsAsync(factory.Services);

        var reservations = ReservationsOf(restaurant.Id);
        var guests = GuestsOf(restaurant.Id);
        // Every demo reservation has a phone number or an email address, so each has its guest.
        Assert.All(reservations, r => Assert.Contains(guests, g => g.Id == r.GuestId));
        Assert.True(guests.Count < reservations.Count);
        Assert.Contains(reservations.GroupBy(r => r.GuestId), g => g.Count(r => r.Status == ReservationStatus.Completed) >= 2);
        var allergic = Assert.Single(guests, g => g.AllergyNotes is not null);
        Assert.Equal("Nussallergie", allergic.AllergyNotes);
        Assert.True(reservations.Count(r => r.GuestId == allergic.Id) >= 2);
        // The birthday note comes with the occasion.
        Assert.All(reservations.Where(r => r.Notes == "Geburtstag"), r => Assert.Equal(Occasion.Birthday, r.Occasion));
    }

    [Fact]
    public async Task Restaurants_with_tables_get_demo_reservations_for_the_past_7_days_today_and_the_next_7_days_once()
    {
        var instant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 50, ("1", 2), ("2", 2), ("3", 4), ("4", 4), ("5", 6)), new TestArea("Terrasse", true, 100, ("6", 4), ("7", 4))]);
        var request = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 4), ("4", 6), ("5", 8))], confirmationMode: ConfirmationMode.Request);
        var withoutTables = await TestRestaurants.CreateAsync(factory, []);

        await DevelopmentSeed.SeedReservationsAsync(factory.Services);

        var today = TestRestaurant.Today;
        var reservations = ReservationsOf(instant.Id);
        Assert.NotEmpty(reservations);
        Assert.All(reservations, r =>
        {
            var date = DateOnly.FromDateTime(r.StartLocal);
            Assert.InRange(date, today.AddDays(-7), today.AddDays(7));
            Assert.NotEqual(DayOfWeek.Monday, date.DayOfWeek);
            Assert.True(r.GuestPhone is not null || r.GuestEmail is not null);
            Assert.Equal(r.StartLocal.AddMinutes(r.DurationMinutes), r.EndLocal);
        });
        // No table is booked twice at the same time.
        Assert.All(reservations, r => Assert.DoesNotContain(reservations, o => o.Id != r.Id && o.TableId == r.TableId && o.StartLocal < r.EndLocal && o.EndLocal > r.StartLocal));
        Assert.DoesNotContain(reservations, r => r.Status == ReservationStatus.Requested);
        // The past days are over: the guests left (at the reservation's end), did not come or cancelled.
        var past = reservations.Where(r => DateOnly.FromDateTime(r.StartLocal) < today).ToList();
        Assert.NotEmpty(past);
        Assert.All(past, r => Assert.Contains(r.Status, new[] { ReservationStatus.Completed, ReservationStatus.NoShow, ReservationStatus.Cancelled }));
        Assert.All(past.Where(r => r.Status == ReservationStatus.Completed), r => Assert.Equal(r.EndLocal, r.CompletedAtLocal));
        Assert.Contains(reservations, r => DateOnly.FromDateTime(r.StartLocal) >= today);
        Assert.Contains(ReservationsOf(request.Id), r => r.Status == ReservationStatus.Requested);
        Assert.Empty(ReservationsOf(withoutTables.Id));
        // Every demo reservation starts its history with one entry of the system.
        var events = EventsOf(instant.Id);
        Assert.Equal(reservations.Select(r => r.Id).Order(), events.Select(e => e.ReservationId).Order());
        Assert.All(events, e => Assert.Equal((ReservationEventKind.Created, ReservationActor.System, null), (e.Kind, e.Actor, e.UserId)));

        // A second start adds nothing.
        await DevelopmentSeed.SeedReservationsAsync(factory.Services);
        Assert.Equal(reservations.Count, ReservationsOf(instant.Id).Count);
        Assert.Equal(events.Count, EventsOf(instant.Id).Count);
    }
}
