using System.Globalization;
using System.IO.Compression;
using Cbplayground.Api.Data;
using Microsoft.Data.Sqlite;

namespace Cbplayground.Api.Backups;

/// <summary>
/// Backs up the SQLite database together with the uploaded floor plans: one zip file per run in "Backup:Path"
/// (relative to the content root), named after the local server time, e.g. "cbplayground-20261031-030000.zip".
/// Backups older than "Backup:RetentionDays" are deleted.
/// The Data Protection keys ("DataProtection:KeysPath") are deliberately not backed up: anyone with a backup could forge
/// sign-in cookies with them, while losing them only signs everybody out once.
/// </summary>
public class DatabaseBackup(IConfiguration configuration, IWebHostEnvironment environment)
{
    private const string FilePrefix = "cbplayground-";
    private const string TimestampFormat = "yyyyMMdd-HHmmss";

    public string BackupDirectory =>
        Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuration["Backup:Path"] ?? "data/backups"));

    public int RetentionDays => configuration.GetValue("Backup:RetentionDays", 30);

    private string UploadsDirectory =>
        Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuration["Uploads:Path"] ?? "data/uploads"));

    /// <summary>Writes a new backup and returns its path. The zip contains the database file and the folder "uploads/".</summary>
    public string Create(DateTime now)
    {
        var connectionString = SqliteConnectionStrings.Resolve(
            configuration.GetConnectionString("Default") ?? throw new InvalidOperationException("Connection string 'Default' is missing."),
            environment.ContentRootPath);
        var databaseFile = new SqliteConnectionStringBuilder(connectionString).DataSource;
        // Opening a missing file would create an empty database and back that up.
        if (!File.Exists(databaseFile))
        {
            throw new FileNotFoundException("The database file does not exist.", databaseFile);
        }

        Directory.CreateDirectory(BackupDirectory);
        var target = Path.Combine(BackupDirectory, $"{FilePrefix}{now.ToString(TimestampFormat, CultureInfo.InvariantCulture)}.zip");
        var databaseCopy = Path.Combine(BackupDirectory, $"{Guid.NewGuid():N}.db.tmp");
        // Written under a temporary name first, so an interrupted run leaves no half-written backup behind.
        var zipInProgress = target + ".tmp";
        try
        {
            // The SQLite online backup gives a consistent copy while the API keeps reading and writing.
            using (var source = new SqliteConnection(connectionString))
            using (var destination = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databaseCopy, Pooling = false }.ToString()))
            {
                source.Open();
                source.BackupDatabase(destination);
            }

            using (var zip = ZipFile.Open(zipInProgress, ZipArchiveMode.Create))
            {
                zip.CreateEntryFromFile(databaseCopy, Path.GetFileName(databaseFile));
                if (Directory.Exists(UploadsDirectory))
                {
                    foreach (var file in Directory.EnumerateFiles(UploadsDirectory, "*", SearchOption.AllDirectories))
                    {
                        zip.CreateEntryFromFile(file, "uploads/" + Path.GetRelativePath(UploadsDirectory, file).Replace('\\', '/'));
                    }
                }
            }

            File.Move(zipInProgress, target, overwrite: true);
        }
        finally
        {
            File.Delete(databaseCopy);
            File.Delete(zipInProgress);
        }

        return target;
    }

    /// <summary>Deletes the backups that are older than the retention period.</summary>
    public void DeleteExpired(DateTime now)
    {
        var oldestToKeep = now.AddDays(-RetentionDays);
        foreach (var (file, createdAt) in Backups())
        {
            if (createdAt < oldestToKeep)
            {
                File.Delete(file);
            }
        }
    }

    /// <summary>The local time of the newest backup, null if there is none.</summary>
    public DateTime? LatestBackupTime() => Backups().Select(b => (DateTime?)b.CreatedAt).Max();

    private IEnumerable<(string File, DateTime CreatedAt)> Backups()
    {
        if (!Directory.Exists(BackupDirectory))
        {
            yield break;
        }

        foreach (var file in Directory.EnumerateFiles(BackupDirectory, $"{FilePrefix}*.zip"))
        {
            var timestamp = Path.GetFileNameWithoutExtension(file)[FilePrefix.Length..];
            if (DateTime.TryParseExact(timestamp, TimestampFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var createdAt))
            {
                yield return (file, createdAt);
            }
        }
    }
}
