using System.Reflection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenantContext)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();

    public DbSet<Area> Areas => Set<Area>();

    public DbSet<Table> Tables => Set<Table>();

    public DbSet<OpeningPeriod> OpeningPeriods => Set<OpeningPeriod>();

    public DbSet<HolidayOverride> HolidayOverrides => Set<HolidayOverride>();

    public DbSet<SpecialDay> SpecialDays => Set<SpecialDay>();

    public DbSet<SpecialDayPeriod> SpecialDayPeriods => Set<SpecialDayPeriod>();

    public DbSet<ReservationSettings> ReservationSettings => Set<ReservationSettings>();

    public DbSet<DurationRule> DurationRules => Set<DurationRule>();

    public DbSet<Reservation> Reservations => Set<Reservation>();

    /// <summary>
    /// The tenant whose data this context reads and writes. The query filters read it on every query,
    /// so it must stay a member of the context (EF Core evaluates context members per instance).
    /// </summary>
    private Guid? CurrentTenantId => tenantContext.TenantId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Tenant>(tenant =>
        {
            tenant.HasIndex(t => t.Slug).IsUnique();
            tenant.Property(t => t.CountryCode).HasMaxLength(2);
            tenant.Property(t => t.RegionCode).HasMaxLength(5);
            tenant.Property(t => t.TimeZoneId).HasMaxLength(64);
            tenant.Property(t => t.Street).HasMaxLength(Tenant.MaxStreetLength);
            tenant.Property(t => t.PostalCode).HasMaxLength(Tenant.MaxPostalCodeLength);
            tenant.Property(t => t.City).HasMaxLength(Tenant.MaxCityLength);
            tenant.Property(t => t.Phone).HasMaxLength(Tenant.MaxPhoneLength);
            tenant.Property(t => t.Email).HasMaxLength(Tenant.MaxEmailLength);
            tenant.Property(t => t.Website).HasMaxLength(Tenant.MaxWebsiteLength);
            tenant.Property(t => t.Description).HasMaxLength(Tenant.MaxDescriptionLength);
        });

        modelBuilder.Entity<OpeningPeriod>(period =>
        {
            period.HasOne<Tenant>().WithMany().HasForeignKey(p => p.TenantId).OnDelete(DeleteBehavior.Cascade);
            period.HasIndex(p => new { p.TenantId, p.DayOfWeek, p.Start });
        });

        modelBuilder.Entity<HolidayOverride>(holidayOverride =>
        {
            holidayOverride.HasOne<Tenant>().WithMany().HasForeignKey(o => o.TenantId).OnDelete(DeleteBehavior.Cascade);
            holidayOverride.HasIndex(o => new { o.TenantId, o.Date }).IsUnique();
        });

        modelBuilder.Entity<SpecialDay>(specialDay =>
        {
            specialDay.HasOne<Tenant>().WithMany().HasForeignKey(d => d.TenantId).OnDelete(DeleteBehavior.Cascade);
            specialDay.HasIndex(d => new { d.TenantId, d.From });
            specialDay.Property(d => d.Kind).HasConversion<string>().HasMaxLength(20);
            specialDay.Property(d => d.Note).HasMaxLength(SpecialDay.MaxNoteLength);
            specialDay.HasMany(d => d.Periods).WithOne().HasForeignKey(p => p.SpecialDayId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SpecialDayPeriod>(period =>
        {
            period.HasOne<Tenant>().WithMany().HasForeignKey(p => p.TenantId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ApplicationUser>(user =>
        {
            user.HasOne(u => u.Tenant)
                .WithMany()
                .HasForeignKey(u => u.TenantId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Area>(area =>
        {
            area.Property(a => a.Name).HasMaxLength(100);
            area.Property(a => a.FloorPlanFileName).HasMaxLength(100);
            area.HasOne<Tenant>()
                .WithMany()
                .HasForeignKey(a => a.TenantId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Table>(table =>
        {
            table.Property(t => t.Number).HasMaxLength(20);
            table.Property(t => t.Shape).HasConversion<string>().HasMaxLength(20);
            table.HasIndex(t => new { t.TenantId, t.Number }).IsUnique();
            table.HasOne<Tenant>()
                .WithMany()
                .HasForeignKey(t => t.TenantId)
                .OnDelete(DeleteBehavior.Restrict);
            // Deleting an area deletes its tables.
            table.HasOne<Area>()
                .WithMany()
                .HasForeignKey(t => t.AreaId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ReservationSettings>(settings =>
        {
            // At most one row per restaurant.
            settings.HasIndex(s => s.TenantId).IsUnique();
            settings.HasOne<Tenant>().WithMany().HasForeignKey(s => s.TenantId).OnDelete(DeleteBehavior.Cascade);
            settings.Property(s => s.ConfirmationMode).HasConversion<string>();
            settings.Property(s => s.TableSelectionMode).HasConversion<string>();
        });

        modelBuilder.Entity<DurationRule>(rule =>
        {
            rule.HasIndex(r => r.TenantId);
            rule.HasOne<Tenant>().WithMany().HasForeignKey(r => r.TenantId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Reservation>(reservation =>
        {
            reservation.HasIndex(r => new { r.TenantId, r.StartLocal });
            reservation.HasIndex(r => r.ReferenceCode).IsUnique();
            reservation.HasOne<Tenant>().WithMany().HasForeignKey(r => r.TenantId).OnDelete(DeleteBehavior.Restrict);
            // A table with reservations cannot be deleted by the database; the endpoints remove the reservations
            // that no longer matter first and refuse the deletion while future ones exist.
            reservation.HasOne<Table>().WithMany().HasForeignKey(r => r.TableId).OnDelete(DeleteBehavior.Restrict);
            reservation.Property(r => r.GuestName).HasMaxLength(Reservation.MaxNameLength);
            reservation.Property(r => r.GuestPhone).HasMaxLength(Reservation.MaxPhoneLength);
            reservation.Property(r => r.GuestEmail).HasMaxLength(Reservation.MaxEmailLength);
            reservation.Property(r => r.Notes).HasMaxLength(Reservation.MaxNotesLength);
            reservation.Property(r => r.ReferenceCode).HasMaxLength(Reservation.ReferenceCodeLength);
            reservation.Property(r => r.Language).HasMaxLength(10);
            reservation.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            reservation.Property(r => r.Source).HasConversion<string>().HasMaxLength(20);
        });

        // The roles are fixed, so the migrations create them in every environment.
        modelBuilder.Entity<IdentityRole>().HasData(
            new IdentityRole { Id = "0b6e3f4e-6a39-4c2b-9d0c-6c1f2a6f0a01", Name = Auth.Roles.Superadmin, NormalizedName = "SUPERADMIN", ConcurrencyStamp = "0b6e3f4e-6a39-4c2b-9d0c-6c1f2a6f0a01" },
            new IdentityRole { Id = "0b6e3f4e-6a39-4c2b-9d0c-6c1f2a6f0a02", Name = Auth.Roles.TenantAdmin, NormalizedName = "TENANTADMIN", ConcurrencyStamp = "0b6e3f4e-6a39-4c2b-9d0c-6c1f2a6f0a02" },
            new IdentityRole { Id = "0b6e3f4e-6a39-4c2b-9d0c-6c1f2a6f0a03", Name = Auth.Roles.FrontDesk, NormalizedName = "FRONTDESK", ConcurrencyStamp = "0b6e3f4e-6a39-4c2b-9d0c-6c1f2a6f0a03" });

        // Every tenant-owned entity only shows the rows of the current tenant.
        // Without a tenant (nobody signed in, or the Superadmin) these queries return nothing.
        var applyTenantFilter = typeof(AppDbContext).GetMethod(nameof(ApplyTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (entityType.BaseType is null && typeof(ITenantOwned).IsAssignableFrom(entityType.ClrType))
            {
                applyTenantFilter.MakeGenericMethod(entityType.ClrType).Invoke(this, [modelBuilder]);
            }
        }
    }

    private void ApplyTenantFilter<TEntity>(ModelBuilder modelBuilder) where TEntity : class, ITenantOwned
    {
        modelBuilder.Entity<TEntity>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyTenantRules();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyTenantRules();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>
    /// Sets the current tenant on new tenant-owned entities and rejects every write that would
    /// create, change or delete data of another tenant.
    /// </summary>
    private void ApplyTenantRules()
    {
        foreach (var entry in ChangeTracker.Entries<ITenantOwned>())
        {
            if (entry.State is EntityState.Unchanged or EntityState.Detached)
            {
                continue;
            }

            var tenantId = CurrentTenantId
                ?? throw new InvalidOperationException($"{entry.Metadata.DisplayName()} is tenant-owned and can only be written by a user of a tenant.");

            if (entry.State == EntityState.Added)
            {
                if (entry.Entity.TenantId == Guid.Empty)
                {
                    entry.Entity.TenantId = tenantId;
                }
                else if (entry.Entity.TenantId != tenantId)
                {
                    throw new InvalidOperationException($"{entry.Metadata.DisplayName()} cannot be created for another tenant.");
                }
            }
            else
            {
                var originalTenantId = entry.Property(e => e.TenantId).OriginalValue;
                if (originalTenantId != tenantId || entry.Entity.TenantId != tenantId)
                {
                    throw new InvalidOperationException($"{entry.Metadata.DisplayName()} of another tenant cannot be changed or deleted.");
                }
            }
        }
    }
}
