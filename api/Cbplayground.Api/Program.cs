using Cbplayground.Api.Auth;
using Cbplayground.Api.Backups;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Connection string 'Default' is missing.");
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, HttpTenantContext>();
builder.Services.AddSingleton<IHolidayProvider, HolidayProvider>();
builder.Services.AddScoped<IOpeningCalendar, OpeningCalendar>();
builder.Services.AddScoped<IReservationDurationPolicy, ReservationDurationPolicy>();

// Daily backup of the database and the uploaded floor plans ("Backup" in appsettings.json, off in Development).
builder.Services.AddSingleton<DatabaseBackup>();
if (builder.Configuration.GetValue("Backup:Enabled", true))
{
    builder.Services.AddHostedService<DatabaseBackupService>();
}

// AddIdentity registers the services only; there is no public registration endpoint (no MapIdentityApi).
builder.Services
    .AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddClaimsPrincipalFactory<TenantClaimsPrincipalFactory>()
    // Token providers for the password reset that a Tenant Admin does in the staff management.
    .AddDefaultTokenProviders();

// Check the security stamp on every request: a deactivated user (or one whose password was set anew)
// is signed out on their next request, and role changes apply right away.
builder.Services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero);

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;

    // This is an API: answer with 401/403 instead of redirecting to a login page.
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(Policies.RequireTenantAdmin, policy => policy.RequireRole(Roles.TenantAdmin))
    .AddPolicy(Policies.RequireStaff, policy => policy.RequireRole(Roles.TenantAdmin, Roles.FrontDesk));

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

    await DevelopmentSeed.SeedUsersAsync(scope.ServiceProvider, app.Configuration);
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapTenantEndpoints();
app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapStaffEndpoints();
app.MapAreaEndpoints();
app.MapTableEndpoints();
app.MapOpeningHoursEndpoints();
app.MapReservationSettingsEndpoints();

app.Run();

// Makes the generated Program class visible to the tests (WebApplicationFactory<Program>).
public partial class Program;
