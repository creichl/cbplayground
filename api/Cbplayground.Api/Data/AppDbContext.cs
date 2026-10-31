using System.Reflection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenantContext)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();

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
        });

        modelBuilder.Entity<ApplicationUser>(user =>
        {
            user.HasOne(u => u.Tenant)
                .WithMany()
                .HasForeignKey(u => u.TenantId)
                .OnDelete(DeleteBehavior.Restrict);
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
