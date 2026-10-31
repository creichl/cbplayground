using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOpeningHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CountryCode",
                table: "Tenants",
                type: "TEXT",
                maxLength: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegionCode",
                table: "Tenants",
                type: "TEXT",
                maxLength: 5,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                table: "Tenants",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "HolidayOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    IsOpen = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HolidayOverrides", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HolidayOverrides_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OpeningPeriods",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    DayOfWeek = table.Column<int>(type: "INTEGER", nullable: false),
                    Start = table.Column<TimeOnly>(type: "TEXT", nullable: false),
                    End = table.Column<TimeOnly>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningPeriods", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OpeningPeriods_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HolidayOverrides_TenantId_Date",
                table: "HolidayOverrides",
                columns: new[] { "TenantId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPeriods_TenantId_DayOfWeek_Start",
                table: "OpeningPeriods",
                columns: new[] { "TenantId", "DayOfWeek", "Start" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HolidayOverrides");

            migrationBuilder.DropTable(
                name: "OpeningPeriods");

            migrationBuilder.DropColumn(
                name: "CountryCode",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "RegionCode",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                table: "Tenants");
        }
    }
}
