using Cbplayground.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Checks the tenant isolation of AppDbContext with a tenant-owned test entity, independent of the app's entities.
/// The isolation of areas and tables through the API is tested in <see cref="AreaAndTableTests"/>.
/// </summary>
public sealed class TenantIsolationTests : IDisposable
{
    public class TestNote : ITenantOwned
    {
        public Guid Id { get; set; }
        public Guid TenantId { get; set; }
        public required string Text { get; set; }
    }

    private class FakeTenantContext(Guid? tenantId) : ITenantContext
    {
        public Guid? TenantId { get; } = tenantId;
    }

    /// <summary>AppDbContext plus the test entity; the query filter and the save rules come from AppDbContext.</summary>
    private class TestDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenantContext) : AppDbContext(options, tenantContext)
    {
        public DbSet<TestNote> Notes => Set<TestNote>();
    }

    private static readonly Guid TenantA = Guid.NewGuid();
    private static readonly Guid TenantB = Guid.NewGuid();

    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly DbContextOptions<AppDbContext> options;
    private readonly Guid noteOfA;

    public TenantIsolationTests()
    {
        connection.Open();
        options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;

        using var db = CreateContext(TenantA);
        db.Database.EnsureCreated();
        var note = new TestNote { Text = "A's note" };
        db.Notes.Add(note);
        db.SaveChanges();
        noteOfA = note.Id;
    }

    public void Dispose() => connection.Dispose();

    private TestDbContext CreateContext(Guid? tenantId) => new(options, new FakeTenantContext(tenantId));

    [Fact]
    public void New_entities_get_the_current_tenant()
    {
        using var db = CreateContext(TenantA);

        Assert.Equal(TenantA, db.Notes.Single(n => n.Id == noteOfA).TenantId);
    }

    [Fact]
    public void A_tenant_only_reads_its_own_data()
    {
        using (var db = CreateContext(TenantB))
        {
            db.Notes.Add(new TestNote { Text = "B's note" });
            db.SaveChanges();
        }

        using var dbA = CreateContext(TenantA);
        using var dbB = CreateContext(TenantB);
        Assert.Equal(["A's note"], dbA.Notes.Select(n => n.Text).ToList());
        Assert.Equal(["B's note"], dbB.Notes.Select(n => n.Text).ToList());
        Assert.Null(dbB.Notes.Find(noteOfA));
        Assert.False(dbB.Notes.Any(n => n.TenantId == TenantA));
    }

    [Fact]
    public void Without_a_tenant_nothing_is_read()
    {
        using var db = CreateContext(null);

        Assert.Empty(db.Notes.ToList());
    }

    [Fact]
    public void A_tenant_cannot_create_data_for_another_tenant()
    {
        using var db = CreateContext(TenantB);
        db.Notes.Add(new TestNote { TenantId = TenantA, Text = "planted by B" });

        Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
    }

    [Fact]
    public void A_tenant_cannot_change_data_of_another_tenant()
    {
        using (var db = CreateContext(TenantB))
        {
            db.Notes.Update(new TestNote { Id = noteOfA, TenantId = TenantA, Text = "changed by B" });

            Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
        }

        using var dbA = CreateContext(TenantA);
        Assert.Equal("A's note", dbA.Notes.Single(n => n.Id == noteOfA).Text);
    }

    [Fact]
    public void A_tenant_cannot_delete_data_of_another_tenant()
    {
        using (var db = CreateContext(TenantB))
        {
            db.Notes.Remove(new TestNote { Id = noteOfA, TenantId = TenantA, Text = "" });

            Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
            Assert.Equal(0, db.Notes.Where(n => n.Id == noteOfA).ExecuteDelete());
            Assert.Equal(0, db.Notes.Where(n => n.Id == noteOfA).ExecuteUpdate(s => s.SetProperty(n => n.Text, "changed by B")));
        }

        using var dbA = CreateContext(TenantA);
        Assert.Equal("A's note", dbA.Notes.Single(n => n.Id == noteOfA).Text);
    }

    [Fact]
    public void A_tenant_cannot_move_its_data_to_another_tenant()
    {
        using var db = CreateContext(TenantA);
        var note = db.Notes.Single(n => n.Id == noteOfA);
        note.TenantId = TenantB;

        Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
    }

    [Fact]
    public void Without_a_tenant_tenant_owned_data_cannot_be_written()
    {
        using var db = CreateContext(null);
        db.Notes.Add(new TestNote { TenantId = TenantA, Text = "no tenant" });

        Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
    }

    [Fact]
    public void A_tenant_can_change_its_own_data()
    {
        using (var db = CreateContext(TenantA))
        {
            db.Notes.Single(n => n.Id == noteOfA).Text = "changed by A";
            db.SaveChanges();
        }

        using var dbA = CreateContext(TenantA);
        Assert.Equal("changed by A", dbA.Notes.Single(n => n.Id == noteOfA).Text);
    }
}
