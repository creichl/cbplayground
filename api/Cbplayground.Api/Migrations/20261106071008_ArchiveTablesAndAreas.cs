using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class ArchiveTablesAndAreas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tables_TenantId_Number",
                table: "Tables");

            migrationBuilder.AddColumn<DateTime>(
                name: "ArchivedAtUtc",
                table: "Tables",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ArchivedAtUtc",
                table: "Areas",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tables_TenantId_Number",
                table: "Tables",
                columns: new[] { "TenantId", "Number" },
                unique: true,
                filter: "\"ArchivedAtUtc\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tables_TenantId_Number",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "ArchivedAtUtc",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "ArchivedAtUtc",
                table: "Areas");

            migrationBuilder.CreateIndex(
                name: "IX_Tables_TenantId_Number",
                table: "Tables",
                columns: new[] { "TenantId", "Number" },
                unique: true);
        }
    }
}
