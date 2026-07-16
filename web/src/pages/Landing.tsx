import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const COMPANY_INTRO = `Founded in 2007, Geo Designs & Research Pvt. Ltd. (GDRPL) carries forward the legacy of Geo Test House, established in 1991 by Mr. Pradip Chauhan, a Gold Medalist Civil Engineer. With its head office in Vadodara and branches across Gujarat & Rajasthan, GDRPL delivers comprehensive civil engineering solutions.

GDRPL serves sectors including Architecture, BIM, Bridge Engineering, Highways, Hydro Projects, Lab Testing, MEPF, Project Management Consultancy, Structural Design, Urban Planning, Green Buildings, Interior Design, and Environmental Solutions.

GDRPL Survey is a digital field survey application designed for highway infrastructure projects. It enables survey teams to collect, organize, and manage field data in a standardized format, ensuring accuracy, consistency, and reliable project execution.`;

export function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <div className="landing">
      <header className="landing-top glass">
        <div className="brand">
          <img src="/gdrpl-logo.png" alt="GDRPL" />
          <span>Geo Design and Research Pvt Ltd Field Survey Application</span>
        </div>
        {!loading && (
          <div className="landing-actions">
            {user ? (
              <Link className="button" to="/app">
                Return to Dashboard
              </Link>
            ) : (
              <Link className="button" to="/login">
                Sign In
              </Link>
            )}
          </div>
        )}
      </header>

      <section className="landing-hero glass">
        <p className="eyebrow">GDRPL Survey</p>
        <h1>Geo Designs & Research Pvt. Ltd.</h1>
        <p className="landing-lead">Digital field survey for highway infrastructure — accurate, consistent, project-ready.</p>
        <div className="landing-actions">
          {user ? (
            <Link className="button" to="/app">
              Return to Dashboard
            </Link>
          ) : (
            <Link className="button" to="/login">
              Sign In
            </Link>
          )}
          <a className="button secondary" href="#about">
            About GDRPL
          </a>
        </div>
      </section>

      <section id="about" className="landing-about glass">
        <h2>Introduction of Company</h2>
        {COMPANY_INTRO.split("\n\n").map((para) => (
          <p key={para.slice(0, 40)}>{para}</p>
        ))}
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Geo Designs & Research Pvt. Ltd.</span>
        <Link to={user ? "/app" : "/login"}>{user ? "Dashboard" : "Sign in"}</Link>
      </footer>
    </div>
  );
}
