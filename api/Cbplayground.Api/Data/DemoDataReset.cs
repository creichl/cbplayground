using Microsoft.Data.Sqlite;

namespace Cbplayground.Api.Data;

/// <summary>
/// <c>dotnet run -- --reset-demo-data</c>: before the start, deletes the database file with its <c>-wal</c> and <c>-shm</c>
/// files and empties the uploads folder, so the start migrates and seeds as on a fresh checkout and new seed content appears.
/// Only in Development; in any other environment the start is aborted and nothing is deleted. Only the paths of the
/// configuration are touched.
/// </summary>
public static class DemoDataReset
{
    public const string Argument = "--reset-demo-data";

    /// <param name="connectionString">The resolved connection string (absolute "Data Source"); an in-memory database has no file.</param>
    /// <param name="uploadsPath">The absolute uploads folder ("Uploads:Path"); the folder itself stays.</param>
    public static void Run(IHostEnvironment environment, string connectionString, string uploadsPath)
    {
        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException(
                $"{Argument} is only allowed in the Development environment, not in '{environment.EnvironmentName}'. Nothing was deleted.");
        }

        var builder = new SqliteConnectionStringBuilder(connectionString);
        if (builder.Mode != SqliteOpenMode.Memory && builder.DataSource is not ("" or ":memory:"))
        {
            foreach (var file in new[] { builder.DataSource, $"{builder.DataSource}-wal", $"{builder.DataSource}-shm" })
            {
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
            }
        }

        if (Directory.Exists(uploadsPath))
        {
            foreach (var file in Directory.EnumerateFiles(uploadsPath))
            {
                File.Delete(file);
            }
            foreach (var directory in Directory.EnumerateDirectories(uploadsPath))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }
}
