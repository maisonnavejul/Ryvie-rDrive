# Ryvie rDrive
<p align="center">
  <a href="https://github.com/linagora/twake-drive">
   <img src="ryvielogo.png" alt="Logo">
  </a>



  

<p align="center">
  <b>The open-source alternative to Google Drive.</b><br />
  <a href="https:"><strong>Learn more »</strong></a><br /><br />
  <a href="https:">Telegram</a> |
  <a href="https:">Website</a> |
  <a href="https:">Issues</a> |
  <a href="https:">Roadmap</a>
</p>



<hr />

<h2>Getting Started</h2>
<ol>
  <li>
    <strong>Clone the repo</strong><br />
    <pre><code>git clone https://github.com/maisonnavejul/Ryvie-rDrop.git</code></pre>
  </li>
  <li>
    <strong>Run all services (including OnlyOffice)</strong><br />
    <pre><code>cd twake-drive/tdrive
docker compose \
  -f docker-compose.minimal.yml \
  -f docker-compose.dev.onlyoffice.yml \
  -f docker-compose.onlyoffice-connector-override.yml \
  up -d</code></pre>
  </li>
  <li>
    <strong>Open the app</strong><br />
    Visit <a href="http://localhost:3000">http://localhost:3000</a> in your browser.
  </li>
</ol>

<hr />

<h2>Development</h2>
<h3>Launching the front-end in development</h3>
<ol>
  <li>
    <strong>Install dependencies</strong><br />
    <pre><code>npm install</code></pre>
  </li>
  <li>
    <strong>Start the front‑end</strong><br />
    <pre><code>cd /home/jules/Desktop/twake-drive/tdrive/frontend/
DISABLE_ESLINT_PLUGIN=true BROWSER=none npm run dev:start</code></pre>
    <p>The front‑end will now be available (usually at <a href="http://localhost:3000">http://localhost:3000</a>).</p>
  </li>
</ol>

<hr />

<h2>License</h2>
<p>
  Twake Drive is licensed under
  <a href="https://github.com/linagora/twake-drive/blob/main/LICENSE">Affero GPL v3</a>.
</p>
