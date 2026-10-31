using Cbplayground.Api.Auth;
using Cbplayground.Api.Backups;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.FloorPlans;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Net;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// A relative "Data Source" is resolved against the content root, like the uploads and backups folders.
var connectionString = SqliteConnectionStrings.Resolve(
    builder.Configuration.GetConnectionString("Default") ?? throw new InvalidOperationException("Connection string 'Default' is missing."),
    builder.Environment.ContentRootPath);
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

// The keys that protect the sign-in cookie, kept on disk so staff stay signed in when the API restarts.
// Not part of the backups (see DatabaseBackup).
var dataProtectionKeysPath = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, builder.Configuration["DataProtection:KeysPath"] ?? "data/keys"));
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath))
    .SetApplicationName("cbplayground");

builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>();

// A request the endpoint cannot bind (missing or invalid parameter, unreadable JSON body) throws a
// BadHttpRequestException, which the exception handler below answers with 400 { "error": "invalid_request" }.
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);

// Behind a reverse proxy: take the client IP and the scheme from X-Forwarded-For and X-Forwarded-Proto, but only from
// the trusted proxies (loopback and "ForwardedHeaders:KnownProxies" / "ForwardedHeaders:KnownNetworks"). Off by default.
var forwardedHeadersEnabled = builder.Configuration.GetValue("ForwardedHeaders:Enabled", false);
if (forwardedHeadersEnabled)
{
    var knownProxies = (builder.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? []).Select(IPAddress.Parse).ToList();
    var knownNetworks = (builder.Configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? []).Select(System.Net.IPNetwork.Parse).ToList();
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        knownProxies.ForEach(options.KnownProxies.Add);
        knownNetworks.ForEach(options.KnownIPNetworks.Add);
    });
}

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<TenantScope>();
builder.Services.AddScoped<ITenantContext, HttpTenantContext>();
// The clock of the reservation rules ("now" in the restaurant's time zone); the tests replace it.
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IHolidayProvider, HolidayProvider>();
builder.Services.AddScoped<IOpeningCalendar, OpeningCalendar>();
builder.Services.AddScoped<IReservationDurationPolicy, ReservationDurationPolicy>();
builder.Services.AddScoped<IAvailabilityService, AvailabilityService>();

// Limits per client IP (with forwarded headers the real client's), answered with 429 { "error": "too_many_requests" }:
// - online bookings: "RateLimiting:PublicBookings:PermitLimit" (default 10) in 10 minutes;
// - sign-in attempts: "RateLimiting:Login:PermitLimit" (default 10) per minute, so nobody can lock out accounts at scale;
// - the public calendar, availability and tables: "RateLimiting:PublicReads:PermitLimit" (default 120) per minute.
var publicBookingLimit = builder.Configuration.GetValue("RateLimiting:PublicBookings:PermitLimit", 10);
var loginLimit = builder.Configuration.GetValue("RateLimiting:Login:PermitLimit", 10);
var publicReadLimit = builder.Configuration.GetValue("RateLimiting:PublicReads:PermitLimit", 120);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, cancellationToken) =>
        new ValueTask(context.HttpContext.Response.WriteAsJsonAsync(new ErrorResponse("too_many_requests"), cancellationToken));
    options.AddPolicy(PublicRestaurantEndpoints.BookingRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = publicBookingLimit, Window = TimeSpan.FromMinutes(10) }));
    // The guest's reservation link (view and cancel) with the same limit, counted apart from the bookings.
    options.AddPolicy(PublicRestaurantEndpoints.ManageRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = publicBookingLimit, Window = TimeSpan.FromMinutes(10) }));
    options.AddPolicy(AuthEndpoints.LoginRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = loginLimit, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy(PublicRestaurantEndpoints.ReadRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = publicReadLimit, Window = TimeSpan.FromMinutes(1) }));
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
    .AddPolicy(Policies.RequireSuperadmin, policy => policy.RequireRole(Roles.Superadmin))
    .AddPolicy(Policies.RequireTenantAdmin, policy => policy.RequireRole(Roles.TenantAdmin))
    .AddPolicy(Policies.RequireStaff, policy => policy.RequireRole(Roles.TenantAdmin, Roles.FrontDesk));

var app = builder.Build();

// In every environment: SQLite creates the database file, but not its folder (e.g. "data/"); then all migrations.
var dataDirectory = Path.GetDirectoryName(new SqliteConnectionStringBuilder(connectionString).DataSource);
if (!string.IsNullOrEmpty(dataDirectory))
{
    Directory.CreateDirectory(dataDirectory);
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    // In every environment: arranges the areas without floor plan image whose tables lie on top of each other (in effect once after the update).
    await StackedTables.ArrangeAsync(app.Services);

    if (app.Environment.IsDevelopment())
    {
        // Demo restaurants with their setup, then the demo users of these restaurants. Both only add what is missing.
        await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
        await DevelopmentSeed.SeedUsersAsync(scope.ServiceProvider, app.Configuration);
        await DevelopmentSeed.SeedReservationsAsync(app.Services);
    }
}

if (forwardedHeadersEnabled)
{
    app.UseForwardedHeaders();
}

// Every unhandled exception is logged by the middleware and answered with 500 { "error": "server_error" }, also in
// Development (the details are in the log, never in the response). Requests that cannot be bound get 400 { "error": "invalid_request" }.
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    // A request the endpoint cannot bind is the client's fault, not an error of the API.
    SuppressDiagnosticsCallback = context => context.Exception is BadHttpRequestException,
    ExceptionHandler = async context =>
    {
        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        if (exception is BadHttpRequestException badRequest)
        {
            context.Response.StatusCode = badRequest.StatusCode;
            await context.Response.WriteAsJsonAsync(new ErrorResponse("invalid_request"));
            return;
        }
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new ErrorResponse("server_error"));
    },
});

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// 200 { "status": "ok" } when the database can be reached, otherwise 503 { "error": "unhealthy" }.
app.MapHealthChecks("/api/health", new HealthCheckOptions
{
    ResponseWriter = (context, report) => report.Status == HealthStatus.Unhealthy
        ? context.Response.WriteAsJsonAsync(new ErrorResponse("unhealthy"))
        : context.Response.WriteAsJsonAsync(new { status = "ok" }),
});
app.MapTenantEndpoints();
app.MapAuthEndpoints();
app.MapSuperadminEndpoints();
app.MapAdminEndpoints();
app.MapStaffEndpoints();
app.MapAreaEndpoints();
app.MapTableEndpoints();
app.MapOpeningHoursEndpoints();
app.MapSpecialDayEndpoints();
app.MapReservationSettingsEndpoints();
app.MapProfileEndpoints();
app.MapPublicRestaurantEndpoints();
app.MapStaffReservationEndpoints();

app.Run();

// Makes the generated Program class visible to the tests (WebApplicationFactory<Program>).
public partial class Program;
