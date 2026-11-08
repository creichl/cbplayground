using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationHoldsAndIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "Reservations",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ReservationHolds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TableIds = table.Column<string>(type: "TEXT", nullable: false),
                    StartLocal = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EndLocal = table.Column<DateTime>(type: "TEXT", nullable: false),
                    PartySize = table.Column<int>(type: "INTEGER", nullable: false),
                    TokenHash = table.Column<byte[]>(type: "BLOB", nullable: false),
                    ClientIp = table.Column<string>(type: "TEXT", maxLength: 45, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReservationHolds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReservationHolds_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Reservations_TenantId_IdempotencyKey",
                table: "Reservations",
                columns: new[] { "TenantId", "IdempotencyKey" },
                filter: "\"IdempotencyKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ReservationHolds_ClientIp_ExpiresAtUtc",
                table: "ReservationHolds",
                columns: new[] { "ClientIp", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ReservationHolds_TenantId_StartLocal",
                table: "ReservationHolds",
                columns: new[] { "TenantId", "StartLocal" });

            migrationBuilder.CreateIndex(
                name: "IX_ReservationHolds_TokenHash",
                table: "ReservationHolds",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReservationHolds");

            migrationBuilder.DropIndex(
                name: "IX_Reservations_TenantId_IdempotencyKey",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "Reservations");
        }
    }
}
