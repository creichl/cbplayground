using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Connection string 'Default' is missing.");
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    // SQLite creates the database file, but not its folder (e.g. "data/").
    var dataSource = new SqliteConnectionStringBuilder(connectionString).DataSource;
    var dataDirectory = Path.GetDirectoryName(Path.GetFullPath(dataSource));
    if (!string.IsNullOrEmpty(dataDirectory))
    {
        Directory.CreateDirectory(dataDirectory);
    }

    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    if (!db.Tenants.Any())
    {
        db.Tenants.AddRange(
            new Tenant { Name = "Gasthaus zur Linde", Slug = "zur-linde", CreatedAt = DateTime.UtcNow },
            new Tenant { Name = "Kafana Dunav", Slug = "kafana-dunav", CreatedAt = DateTime.UtcNow });
        db.SaveChanges();
    }
}

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapTenantEndpoints();

app.Run();
