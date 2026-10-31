using System.Globalization;

namespace Cbplayground.Api.Backups;

/// <summary>
/// Backs up the database once a day at "Backup:TimeOfDay" (local server time) and then deletes expired backups.
/// If the newest backup is more than a day old when the API starts (e.g. it was down at that time), it backs up right away.
/// </summary>
public class DatabaseBackupService(DatabaseBackup backup, IConfiguration configuration, ILogger<DatabaseBackupService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var timeOfDay = TimeOnly.Parse(configuration["Backup:TimeOfDay"] ?? "03:00", CultureInfo.InvariantCulture);

        if (IsOverdue(backup.LatestBackupTime(), DateTime.Now))
        {
            Run();
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            // Waits in UTC, so a change to or from daylight saving time does not shift the run by an hour.
            var delay = NextRun(DateTime.Now, timeOfDay).ToUniversalTime() - DateTime.UtcNow;
            await Task.Delay(delay > TimeSpan.Zero ? delay : TimeSpan.Zero, stoppingToken);
            Run();
        }
    }

    /// <summary>The next time of day after <paramref name="now"/>: today if it is still ahead, otherwise tomorrow.</summary>
    public static DateTime NextRun(DateTime now, TimeOnly timeOfDay)
    {
        var today = now.Date + timeOfDay.ToTimeSpan();
        return today > now ? today : today.AddDays(1);
    }

    /// <summary>Whether a backup is due right away: there is none yet, or the newest one is at least a day old.</summary>
    public static bool IsOverdue(DateTime? latestBackup, DateTime now) =>
        latestBackup is null || now - latestBackup.Value >= TimeSpan.FromDays(1);

    private void Run()
    {
        try
        {
            var now = DateTime.Now;
            var file = backup.Create(now);
            backup.DeleteExpired(now);
            logger.LogInformation("Database backup written to {File}.", file);
        }
        catch (Exception exception)
        {
            // A failed backup must not stop the API; the next run tries again.
            logger.LogError(exception, "Database backup failed.");
        }
    }
}
