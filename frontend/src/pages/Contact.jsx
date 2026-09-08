import "./Contact.css";

function Contact() {
  return (
    <main className="contact-page">
      <div className="contact-container">
        <h1>Contact Us</h1>
        <p>
          Have a question about the AI Based Urban Smart City Monitoring System, or
          need help with a report you've submitted? Reach out and we'll get back to
          you.
        </p>

        <div className="contact-details">
          <div className="contact-item">
            <h2>Support</h2>
            <p>support@smartcity.example</p>
          </div>

          <div className="contact-item">
            <h2>Civic Issues Helpline</h2>
            <p>+1 (555) 010-1000</p>
          </div>

          <div className="contact-item">
            <h2>Office Hours</h2>
            <p>Monday – Friday, 9:00 AM – 6:00 PM</p>
          </div>
        </div>

        <p className="contact-note">
          For emergencies (e.g. active water main breaks, downed live wires, or
          collapsed structures), please contact your local emergency services
          directly rather than reporting through this platform.
        </p>
      </div>
    </main>
  );
}

export default Contact;
