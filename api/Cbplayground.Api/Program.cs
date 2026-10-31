using Cbplayground.Api.Auth;
using Cbplayground.Api.Backups;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Connection string 'Default' is missing.");
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<TenantScope>();
builder.Services.AddScoped<ITenantContext, HttpTenantContext>();
builder.Services.AddSingleton<IHolidayProvider, HolidayProvider>();
builder.Services.AddScoped<IOpeningCalendar, OpeningCalendar>();
builder.Services.AddScoped<IReservationDurationPolicy, ReservationDurationPolicy>();
builder.Services.AddScoped<IAvailabilityService, AvailabilityService>();

// Online bookings per client IP: at most "RateLimiting:PublicBookings:PermitLimit" (default 10) in 10 minutes, then 429.
var publicBookingLimit = builder.Configuration.GetValue("RateLimiting:PublicBookings:PermitLimit", 10);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(PublicRestaurantEndpoints.BookingRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = publicBookingLimit, Window = TimeSpan.FromMinutes(10) }));
});

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

    // Demo restaurants with their setup, then the demo users of these restaurants. Both only add what is missing.
    await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
    await DevelopmentSeed.SeedUsersAsync(scope.ServiceProvider, app.Configuration);
    await DevelopmentSeed.SeedReservationsAsync(app.Services);
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapTenantEndpoints();
app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapStaffEndpoints();
app.MapAreaEndpoints();
app.MapTableEndpoints();
app.MapOpeningHoursEndpoints();
app.MapReservationSettingsEndpoints();
app.MapProfileEndpoints();
app.MapPublicRestaurantEndpoints();
app.MapStaffReservationEndpoints();

app.Run();

// Makes the generated Program class visible to the tests (WebApplicationFactory<Program>).
public partial class Program;
