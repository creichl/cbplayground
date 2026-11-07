using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationWasRequested : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "WasRequested",
                table: "Reservations",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // Existing reservations: the open and the declined requests were requests; of the confirmed ones it is not known,
            // so accepting them cannot be undone.
            migrationBuilder.Sql("UPDATE \"Reservations\" SET \"WasRequested\" = 1 WHERE \"Status\" IN ('Requested', 'Declined');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WasRequested",
                table: "Reservations");
        }
    }
}
