using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTableCombinations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReservationTables",
                columns: table => new
                {
                    ReservationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TableId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReservationTables", x => new { x.ReservationId, x.TableId });
                    table.ForeignKey(
                        name: "FK_ReservationTables_Reservations_ReservationId",
                        column: x => x.ReservationId,
                        principalTable: "Reservations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ReservationTables_Tables_TableId",
                        column: x => x.TableId,
                        principalTable: "Tables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReservationTables_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TableCombinations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AreaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Seats = table.Column<int>(type: "INTEGER", nullable: false),
                    MinGuests = table.Column<int>(type: "INTEGER", nullable: false),
                    OnlineBookable = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TableCombinations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TableCombinations_Areas_AreaId",
                        column: x => x.AreaId,
                        principalTable: "Areas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TableCombinations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TableCombinationTables",
                columns: table => new
                {
                    CombinationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TableId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TableCombinationTables", x => new { x.CombinationId, x.TableId });
                    table.ForeignKey(
                        name: "FK_TableCombinationTables_TableCombinations_CombinationId",
                        column: x => x.CombinationId,
                        principalTable: "TableCombinations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TableCombinationTables_Tables_TableId",
                        column: x => x.TableId,
                        principalTable: "Tables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TableCombinationTables_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReservationTables_TableId",
                table: "ReservationTables",
                column: "TableId");

            migrationBuilder.CreateIndex(
                name: "IX_ReservationTables_TenantId",
                table: "ReservationTables",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_TableCombinations_AreaId",
                table: "TableCombinations",
                column: "AreaId");

            migrationBuilder.CreateIndex(
                name: "IX_TableCombinations_TenantId",
                table: "TableCombinations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_TableCombinationTables_TableId",
                table: "TableCombinationTables",
                column: "TableId");

            migrationBuilder.CreateIndex(
                name: "IX_TableCombinationTables_TenantId",
                table: "TableCombinationTables",
                column: "TenantId");

            // Every existing reservation has exactly one table: its TableId.
            migrationBuilder.Sql("""INSERT INTO "ReservationTables" ("ReservationId", "TableId", "TenantId") SELECT "Id", "TableId", "TenantId" FROM "Reservations";""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReservationTables");

            migrationBuilder.DropTable(
                name: "TableCombinationTables");

            migrationBuilder.DropTable(
                name: "TableCombinations");
        }
    }
}
