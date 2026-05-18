import Link from "next/link";

export const metadata = {
  title: 'Book an Appointment | Sama Sama',
  description: 'Schedule a warehouse viewing or collection appointment with the Sama Sama team.',
};

// TODO: Replace this with your actual SetMore booking page URL
// You can find it in SetMore → Settings → Booking Page → Your booking link
const SETMORE_BOOKING_URL = process.env.NEXT_PUBLIC_SETMORE_URL || '';

export default function AppointmentsPage() {
  return (
    <div className="container-site" style={{ padding: "4rem 2rem", minHeight: "80vh" }}>
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ marginBottom: "1rem" }}>Book an Appointment</h1>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "600px", margin: "0 auto" }}>
          Schedule a warehouse viewing or arrange a collection time that works for you.
        </p>
      </div>

      {SETMORE_BOOKING_URL ? (
        <div style={{ maxWidth: "800px", margin: "0 auto", background: "white", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          <iframe
            src={SETMORE_BOOKING_URL}
            width="100%"
            height="700"
            style={{ border: "none", display: "block" }}
            title="Book an Appointment with Sama Sama"
            loading="lazy"
          />
        </div>
      ) : (
        <div style={{ maxWidth: "600px", margin: "0 auto", background: "white", padding: "3rem 2rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-md)", textAlign: "center" }}>
          <span style={{ fontSize: "3rem", display: "block", marginBottom: "1rem" }}>📅</span>
          <h3 style={{ marginBottom: "1rem" }}>Appointment Booking Coming Soon</h3>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "2rem" }}>
            Our online booking system is being set up. In the meantime, please reach out to us directly to schedule an appointment.
          </p>
          <a href="mailto:support@samasama.com" className="btn btn-primary btn-lg" style={{ display: "inline-block" }}>
            Contact Us to Book
          </a>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: "4rem" }}>
        <Link href="/" style={{ color: "var(--color-primary)", fontWeight: 600, display: "inline-block", padding: "0.5rem 1rem", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-md)" }}>
          ← Back to Homepage
        </Link>
      </div>
    </div>
  );
}
