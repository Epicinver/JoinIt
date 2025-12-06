import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import readline from "readline";
import { Client, GatewayIntentBits, PermissionsBitField } from "discord.js";

process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fix paste not working
if (process.stdin.isTTY) {
  process.stdin.setRawMode(false);
}

const ask = q => new Promise(res => rl.question(q, res));

let config = { clientId: "", clientSecret: "", botToken: "" };

async function main() {
  console.log(`
_________ _______ _________ _       __________________
\\__    _/(  ___  )\\__   __/( (    /|\\__   __/\\__   __/
   )  (  | (   ) |   ) (   |  \\  ( |   ) (      ) (   
   |  |  | |   | |   | |   |   \\ | |   | |      | |   
   |  |  | |   | |   | |   | (\\ \\) |   | |      | |   
   |  |  | |   | |   | |   | | \\   |   | |      | |   
|\\_)  )  | (___) |___) (___| )  \\  |___) (___   | |   
(____/   (_______)\\_______/|/    )_)\\_______/   )_(   

    = join servers for you abuse =
         = made by epicinver =
               = UwU =

V9 (Cloudflare Tunnel Edition)
`);

  config.clientId = await ask("Client ID: ");
  config.clientSecret = await ask("Client Secret: ");
  config.botToken = await ask("Bot Token: ");

  console.log("\nStart this in ANOTHER terminal:");
  console.log("cloudflared tunnel --url http://localhost:3000\n");
  console.log("Paste your Cloudflare URL below.\n");

  const cfUrl = await ask("Cloudflare public URL: ");
  const redirectUri = cfUrl + "/callback";

  console.log("\nUse this redirect inside Discord Dev Portal:");
  console.log(redirectUri, "\n");

  const app = express();

  app.get("/", (req, res) => {
    const url =
      `https://discord.com/oauth2/authorize?client_id=${config.clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=identify%20guilds.join`;

    res.send(`<h1>Authorize</h1><a href='${url}'>Login</a>`);
    console.log("OAuth URL:", url);
  });

  let users = [];
  if (fs.existsSync("users.json"))
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));

  app.get("/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("Missing code");

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });

    const token = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    }).then(r => r.json());

    const user = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${token.token_type} ${token.access_token}` }
    }).then(r => r.json());

    users.push({
      id: user.id,
      username: user.username,
      access_token: token.access_token
    });

    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

    console.log("Saved:", user.username);
    res.send("Authorized!");
  });

  app.listen(3000, () => console.log("OAuth server running on port 3000"));

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  client.once("ready", () => {
    console.log("\nBot logged in as:", client.user.tag);
    loop();
  });

  async function loop() {
    const gid = await ask("\nGuild ID: ");
    if (gid === "exit") process.exit(0);

    let guild;
    try {
      guild = await client.guilds.fetch(gid);
    } catch {
      console.log("Bot not in guild.");
      return loop();
    }

    console.log("Guild:", guild.name);

    try {
      const chans = await guild.channels.fetch();
      const ch = chans.find(
        c =>
          c?.isTextBased?.() &&
          c.permissionsFor(guild.members.me)?.has(
            PermissionsBitField.Flags.CreateInstantInvite
          )
      );
      if (ch) {
        const i = await ch.createInvite({ maxAge: 3600 });
        console.log("Invite:", i.url);
      }
    } catch {}

    for (const u of users) {
      try {
        await guild.members.add(u.id, {
          accessToken: u.access_token
        });
        console.log("Joined:", u.username);
      } catch (e) {
        console.log("Fail:", u.username, e.message);
      }
    }

    loop();
  }

  client.login(config.botToken);
}

main();
