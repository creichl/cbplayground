using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSpecialDaysAndBookingRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Saved settings get the defaults of ReservationSettings: 90 days ahead, 60 minutes lead time, no buffer.
            migrationBuilder.AddColumn<int>(
                name: "BookingHorizonDays",
                table: "ReservationSettings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 90);

            migrationBuilder.AddColumn<int>(
                name: "BufferMinutes",
                table: "ReservationSettings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MaxOnlinePartySize",
                table: "ReservationSettings",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinLeadTimeMinutes",
                table: "ReservationSettings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 60);

            migrationBuilder.CreateTable(
                name: "SpecialDays",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    From = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    To = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpecialDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpecialDays_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SpecialDayPeriods",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SpecialDayId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Start = table.Column<TimeOnly>(type: "TEXT", nullable: false),
                    End = table.Column<TimeOnly>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpecialDayPeriods", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpecialDayPeriods_SpecialDays_SpecialDayId",
                        column: x => x.SpecialDayId,
                        principalTable: "SpecialDays",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SpecialDayPeriods_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SpecialDayPeriods_SpecialDayId",
                table: "SpecialDayPeriods",
                column: "SpecialDayId");

            migrationBuilder.CreateIndex(
                name: "IX_SpecialDayPeriods_TenantId",
                table: "SpecialDayPeriods",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_SpecialDays_TenantId_From",
                table: "SpecialDays",
                columns: new[] { "TenantId", "From" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SpecialDayPeriods");

            migrationBuilder.DropTable(
                name: "SpecialDays");

            migrationBuilder.DropColumn(
                name: "BookingHorizonDays",
                table: "ReservationSettings");

            migrationBuilder.DropColumn(
                name: "BufferMinutes",
                table: "ReservationSettings");

            migrationBuilder.DropColumn(
                name: "MaxOnlinePartySize",
                table: "ReservationSettings");

            migrationBuilder.DropColumn(
                name: "MinLeadTimeMinutes",
                table: "ReservationSettings");
        }
    }
}
