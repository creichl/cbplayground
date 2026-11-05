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

    /// <summary>
    /// In Development, the API holds this lock on its database file (<c>&lt;database&gt;.lock</c>) for as long as it runs. A second
    /// start on the same database, above all one with <see cref="Argument"/>, aborts before it touches anything: the reset would
    /// delete the database and the images of the running API, which then keeps serving its deleted database and answers every
    /// logo, cover image and photo with 404.
    /// </summary>
    /// <param name="connectionString">The resolved connection string (absolute "Data Source").</param>
    /// <returns>The lock, held until it is disposed (or the process ends); null for an in-memory database, which no other process can open.</returns>
    /// <exception cref="InvalidOperationException">Another API holds the lock.</exception>
    public static FileStream? Lock(string connectionString)
    {
        var builder = new SqliteConnectionStringBuilder(connectionString);
        if (builder.Mode == SqliteOpenMode.Memory || builder.DataSource is "" or ":memory:")
        {
            return null;
        }

        var lockPath = $"{builder.DataSource}.lock";
        Directory.CreateDirectory(Path.GetDirectoryName(lockPath)!);
        try
        {
            // FileShare.None: on Windows a sharing violation, on Linux and macOS an exclusive flock for another process.
            return new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        }
        catch (IOException exception)
        {
            throw new InvalidOperationException(
                $"Another API is already running with the database '{builder.DataSource}' (it holds '{lockPath}'). Stop it first, " +
                $"then start again; with {Argument} the start would delete the database and the images of the running API. Nothing was deleted.",
                exception);
        }
    }

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
