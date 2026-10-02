import React from 'react';
import { Link } from 'react-router-dom';
import './AccountForm.css';
import './Privacy.css';

const CONTACT = 'info@spyrostrimis.com';

const external = { target: '_blank', rel: 'noopener noreferrer' };

export default function Privacy() {
  return <div className="account privacy">
    <section className="account-panel-inner">
      <h1>Privacy</h1>
      <p className="privacy-lead">Hangman: Rescue Mission is a free, non-commercial portfolio project. This page explains, in plain words, what the site keeps about you and why.</p>

      <h2>Who runs this site</h2>
      <p>Spyros Trimis, in Greece, runs this site personally. Contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>

      <h2>Playing as a guest</h2>
      <p>Guest play creates no account data. Your guesses and the game state stay in your browser.</p>

      <h2>What an account stores, and why</h2>
      <ul>
        <li><strong>Your username</strong>, to sign you in. It is shown publicly in the Hall of Fame with your score.</li>
        <li><strong>A password check value.</strong> Your password never leaves your browser. The browser turns it into a one-way code, and the server keeps only a keyed hash of that code, so it can check your password without knowing it.</li>
        <li><strong>Your total score</strong> and when it last changed, for the Hall of Fame.</li>
        <li><strong>Round records</strong>: which word a round dealt you, and when it started, expired or was won. They are used to check wins and award points only once.</li>
        <li>When the account was created.</li>
      </ul>
      <p>We do not ask for an email address, a phone number or your real name. There are no ads and no analytics.</p>

      <h2>Cookies</h2>
      <p>When you sign in, the site sets one cookie, <code>__Host-hangman_session</code>, which keeps you signed in for up to 24 hours. Signing out removes it.</p>
      <p>Cloudflare, which hosts the site, may also set security cookies that protect it from automated abuse, such as <code>__cf_bm</code> (expires after 30 minutes of inactivity) and <code>cf_clearance</code>. Cloudflare describes these as <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" {...external}>strictly necessary</a>.</p>
      <p>All of these cookies are needed to run the site, and none is used for tracking or advertising, so there is no cookie banner.</p>

      <h2>IP addresses and logs</h2>
      <p>Like any website, your IP address reaches the server with every request. Cloudflare processes it to deliver the site, to protect it from bots, and to limit how many requests one address or one username can make per minute.</p>
      <p>Request logging is turned off. If something goes wrong, the server records only what failed (an event name, the page path and the request method). Occasionally, to fix a problem, more detailed diagnostic logs may be switched on for a short time. Cloudflare keeps these logs for up to 3 days.</p>

      <h2>Merriam-Webster audio</h2>
      <p>When you press the pronunciation button, your browser downloads the recording directly from Merriam-Webster (<code>media.merriam-webster.com</code>). Merriam-Webster then receives your IP address and which recording you played. Nothing is sent to them unless you press the button.</p>

      <h2>Play vs AI (Illucia)</h2>
      <p>Illucia guesses in your browser and never sees your secret word while she plays. Your browser downloads a word list from this site for your word's length only.</p>
      <p>If you are signed in, your browser sends your word to the server when the round starts, so the server can check a win and award points. It is kept in the round record, like a Hangman round. Words that beat Illucia are kept with your account until you delete it, so the same word cannot earn points twice.</p>

      <h2>Cloudflare</h2>
      <p>Cloudflare hosts the site, the database and the images, and processes this data on our behalf under its <a href="https://www.cloudflare.com/cloudflare-customer-dpa/" {...external}>Data Processing Addendum</a>. Data may be processed outside the EU; the addendum covers this with the EU Standard Contractual Clauses and the EU–US Data Privacy Framework. See also <a href="https://www.cloudflare.com/privacypolicy/" {...external}>Cloudflare's privacy policy</a>.</p>

      <h2>How long data is kept</h2>
      <ul>
        <li><strong>Account, username and score:</strong> until you delete your account.</li>
        <li><strong>Words that beat Illucia:</strong> until you delete your account.</li>
        <li><strong>Round records:</strong> deleted about 24 hours after the round is won or expires. Cleanup runs every hour, so it can take a little longer, and it can be delayed if the cleanup fails.</li>
        <li><strong>Session cookie:</strong> up to 24 hours.</li>
        <li><strong>Diagnostic logs:</strong> up to 3 days.</li>
        <li><strong>After you delete your account:</strong> it is removed from the live database at once. Database recovery copies may still contain it for up to 7 days. For those 7 days we also keep the account's random ID (not your username) so that a database restore cannot bring the account back.</li>
      </ul>

      <h2>Deleting your account</h2>
      <p>Sign in, open <Link to="/account">Account</Link>, enter your password and confirm. Deletion is permanent: your account, round records, the words that beat Illucia and your Hall of Fame entry are removed and cannot be recovered.</p>

      <h2>Your rights</h2>
      <p>You can ask what data we hold about you, or ask us to correct or delete it, by writing to the contact above. You also have the right to <a href="https://www.dpa.gr/en/individuals/complaint-to-the-hellenic-dpa" {...external}>complain to the Hellenic Data Protection Authority</a>.</p>
    </section>
  </div>;
}
