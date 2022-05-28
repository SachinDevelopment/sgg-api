const express = require("express");
const bodyParser = require("body-parser");
const port = 5000;
const app = express();
const cors = require("cors");
const pool = require("./db");

// ratings constants
const k = 40;
const diff = 1200;
const inflationRate = 1.25;

// Season info
const currentSeason = 3;
const previousSeason = currentSeason - 1;
//const season1StartDate = "2021-03-06"
//const season2StartDate = "2021-03-25";
const seasonStartDate = "2021-05-31";

app.use(bodyParser.json());
app.use(cors({
    origin: 'https://sunnydotgg.live/',
    credentials:true,           
}
));

app.get("/players", async (req, res) => {
  let conn;
  try {
    // establish a connection to MariaDB
    conn = await pool.getConnection();
    // create a new query
    var query = `select p.*,prev.rating as prev_rating from players p left join players_season_${previousSeason} prev on p.id=prev.id`;
    const func = (id, name, allChamps) => {
      const promises = allChamps.map(async (champ) => {
        let query = `select count(*) as count from games where ((red rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="red") or (blue rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="blue")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        const wins = await conn.query(query);
        query = `select count(*) as count from games where ((red rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="blue") or (blue rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="red")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        const loses = await conn.query(query);
        return {
          name: champ,
          count: wins[0].count + loses[0].count,
          wins: wins[0].count,
          loses: loses[0].count,
        };
      });

      return Promise.all(promises);
    };
    // execute the query and set the result to a new variable
    var rows = await conn.query(query);
    const func2 = () => {
      rows = rows.map(async (player) => {
        let srChampsQuery = `select blue,red from games where (red rlike "${player.id}-[^,]+-[^,]+-${player.name}-${player.id}" or blue rlike "${player.id}-[^,]+-[^,]+-${player.name}-${player.id}") and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        var srChamps = await conn.query(srChampsQuery);
        srChamps = srChamps.slice(0, srChamps.length);
        srChamps = srChamps.map(
          (c) =>
            c.red.match(`${player.id}.*-(.*)-${player.name}-${player.id}`) ||
            c.blue.match(`${player.id}.*-(.*)-${player.name}-${player.id}`)
        );
        srChamps = srChamps.map((c) => c[1]);
        srChamps = [...new Set(srChamps)];
        const srChampWrArr = await func(player.id, player.name, srChamps);

        return {
          ...player,
          fav_champs: srChampWrArr
            .sort((a, b) => b.count - a.count || b.wins - a.wins)
            .splice(0, 5),
        };
      });
      return Promise.all(rows);
    };

    const playerData = await func2();
    res.send(playerData);
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.get("/players/fast", async (req, res) => {
  let conn;
  try {
    // establish a connection to MariaDB
    conn = await pool.getConnection();
    // create a new query
    var query = `select * from players_season_2`;
    res.send(await conn.query(query));
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.get("/player/:id/stats", async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();

    var query = `select name from players where id = ${id};`;
    var [nameResult] = await conn.query(query);
    var { name } = nameResult;

    var playerquery = `select * from players where id = ${id};`;
    var [player] = await conn.query(playerquery);

    query = `select count(*) as count from games where (red rlike "${id}-Jungle-[^,]+-${name}-${id}" or blue rlike "${id}-Jungle-[^,]+-${name}-${id}") and map="Summoner's Rift" and date > "${seasonStartDate}" ;`;
    var [srJungle] = await conn.query(query);

    query = `select count(*) as count from games where (red rlike "${id}-Lane-[^,]+-${name}-${id}" or blue rlike "${id}-Lane-[^,]+-${name}-${id}") and map="Summoner's Rift" and date > "${seasonStartDate}" ;`;
    var [srLane] = await conn.query(query);

    query = `select count(*) as count from games where (red rlike "${id}-Fill-[^,]+-${name}-${id}" or blue rlike "${id}-Fill-[^,]+-${name}-${id}") and map="Summoner's Rift" and date > "${seasonStartDate}";`;
    var [srFill] = await conn.query(query);

    query = `select count(*) as count from games where ((red rlike "${id}-Lane-[^,]+-${name}-${id}" and winning_side="red") or (blue rlike "${id}-Lane-[^,]+-${name}-${id}" and winning_side="blue")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
    var [laneWins] = await conn.query(query);
    const laneWR = srLane.count
      ? Number((laneWins.count / srLane.count) * 100).toFixed(0)
      : 0;

    query = `select count(*) as count from games where ((red rlike "${id}-Jungle-[^,]+-${name}-${id}" and winning_side="red") or (blue rlike "${id}-Jungle-[^,]+-${name}-${id}" and winning_side="blue")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
    var [jungleWins] = await conn.query(query);
    const jungleWR = srJungle.count
      ? Number((jungleWins.count / srJungle.count) * 100).toFixed(0)
      : 0;

    let srChampsQuery = `select blue,red from games where (red rlike "${id}-[^,]+-[^,]+-${name}-${id}" or blue rlike "${id}-[^,]+-[^,]+-${name}-${id}") and map="Summoner's Rift" and date > "${seasonStartDate}";`;
    var srChamps = await conn.query(srChampsQuery);
    srChamps = srChamps.slice(0, srChamps.length);
    console.log("test", srChamps);
    srChamps = srChamps.map(
      (c) =>
        c.red.match(`${id}.*-(.*)-${name}-${id}`) ||
        c.blue.match(`${id}.*-(.*)-${name}-${id}`)
    );
    console.log("test", srChamps);
    srChamps = srChamps.map((c) => c[1]);
    srChamps = [...new Set(srChamps)];

    const func = () => {
      const promises = srChamps.map(async (champ) => {
        let query = `select count(*) as count from games where ((red rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="red") or (blue rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="blue")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        const wins = await conn.query(query);
        query = `select count(*) as count from games where ((red rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="blue") or (blue rlike "${id}-[^,]+-${champ}-${name}-${id}" and winning_side="red")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        const loses = await conn.query(query);
        return {
          name: champ,
          count: wins[0].count + loses[0].count,
          wins: wins[0].count,
          loses: loses[0].count,
        };
      });

      return Promise.all(promises);
    };

    const srChampWrArr = await func();

    const prevRatings = [];
    for (i = 1; i <= previousSeason; i++) {
      let query = `select rating from players_season_${i} where id = ${id}`;
      const [rating] = await conn.query(query);
      query = `SELECT a.rank FROM (SELECT *, RANK() OVER (ORDER BY rating DESC) AS rank from players_season_${i} where wins + loses >= 10) a WHERE a.id = ${id};`;
      const [rank] = await conn.query(query);
      prevRatings.push({ season: i, ...rating, ...rank });
    }

    var query = `select rating as lastSeasonRating from players_season_${previousSeason} where id = ${id}`;
    var [lastSeasonRating] = await conn.query(query);

    res.send({
      ...player,
      ...lastSeasonRating,
      lane: srLane.count,
      laneWR,
      jungle: srJungle.count,
      jungleWR,
      fill: srFill.count,
      champs: srChampWrArr,
      prevRatings,
    });
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.get("/champs", async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    let champsQuery = `select blue, red from games where date > "${seasonStartDate}";`;
    var champs = await conn.query(champsQuery);
    champs = champs.slice(0, champs.length);
    const newChamps = [];
    champs = champs.forEach((c) => {
      let blueSplit = c.blue.split(",");
      let redSplit = c.red.split(",");
      blueSplit = blueSplit.map((c) => c.match(`[^,].*-(.*)-[^,]+-[^,]+`));
      redSplit = redSplit.map((c) => c.match(`[^,].*-(.*)-[^,]+-[^,]+`));
      blueSplit = blueSplit.map((c) => c[1]);
      redSplit = redSplit.map((c) => c[1]);
      newChamps.push(...blueSplit, ...redSplit);
    });

    champs = [...new Set(newChamps)];
    const func = () => {
      const promises = champs.map(async (champ) => {
        let query = `select count(*) as count from games where ((red rlike "[^,]-[^,]+-${champ}-[^,]+-[^,]+" and winning_side="red") or (blue rlike "[^,]+-[^,]+-${champ}-[^,]+-[^,]+" and winning_side="blue")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        const wins = await conn.query(query);
        query = `select count(*) as count from games where ((red rlike "[^,]-[^,]+-${champ}-[^,]+-[^,]+" and winning_side="blue") or (blue rlike "[^,]+-[^,]+-${champ}-[^,]+-[^,]+" and winning_side="red")) and map="Summoner's Rift" and date > "${seasonStartDate}";`;
        const loses = await conn.query(query);
        return {
          name: champ,
          count: wins[0].count + loses[0].count,
          wins: wins[0].count,
          loses: loses[0].count,
        };
      });

      return Promise.all(promises);
    };

    const champWrArr = await func();

    res.send(champWrArr);
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});
app.get("/player/:id/map/:map/games", async (req, res) => {
  const { id, map } = req.params;
  let mapF = "";
  if (map === "SR") {
    mapF = "Summoner's Rift";
  } else if (map === "HA") {
    mapF = "Howling Abyss";
  }

  const { page, limit } = req.query;
  let conn;
  try {
    conn = await pool.getConnection();
    var query = `select name from players where id = ${id};`;
    var [nameResult] = await conn.query(query);
    var { name } = nameResult;
    var query = `select * from games where (red rlike "${id}-[^,]+-[^,]+-${name}-${id}" or blue rlike "${id}-[^,]+-[^,]+-${name}-${id}") and date > "${seasonStartDate}" and  map="${mapF}" order by id desc limit ${
      limit || 1000
    } offset ${page * limit - limit || 0};`;
    var rows = await conn.query(query);

    var query = `select count(*) as count from games where (red rlike "${id}-[^,]+-[^,]+-${name}-${id}" or blue rlike "${id}-[^,]+-[^,]+-${name}-${id}") and date > "${seasonStartDate}" and map="${mapF}";`;
    var total = await conn.query(query);

    rows = rows.map((row) => {
      const redPlayers = row.red.split(",");
      const bluePlayers = row.blue.split(",");

      let winner = false;

      if (row.winning_side === "blue") {
        winner = bluePlayers.some((element) => {
          const [, , , player] = element.split("-");
          return player === name;
        });
      }

      if (row.winning_side === "red") {
        winner = redPlayers.some((element) => {
          const [, , , player] = element.split("-");
          return player === name;
        });
      }
      const ratingChange = winner ? row.winner_rating : row.loser_rating;
      const redTeam = redPlayers.map((player) => {
        const [id, role, champ, playerName] = player.split("-");
        return { id, role, player: playerName, champ };
      });

      const blueTeam = bluePlayers.map((player) => {
        const [id, role, champ, playerName] = player.split("-");
        return { id, role, player: playerName, champ };
      });

      const { champ: myChamp } = [...redTeam, ...blueTeam].find(
        (e) => e.player === name
      );

      return {
        id: row.id,
        map: row.map,
        date: row.date,
        blue: blueTeam,
        red: redTeam,
        winner,
        myChamp,
        playerName: name,
        ratingChange,
      };
    });

    res.send({ total: total[0].count, games: rows });
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});
app.get("/stats/:id", async (req, res) => {
  const { id } = req.params;

  let conn;
  try {
    // establish a connection to MariaDB
    conn = await pool.getConnection();
    var query = `SELECT id, name FROM players where id = ${id}`;
    const me = await conn.query(query);
    query = `SELECT id, name FROM players where id != ${id}`;
    const others = await conn.query(query);
    const winrate = (wins, games) => {
      if (games === 0) return 0;
      return Math.round((wins * 100) / games);
    };
    const func = () => {
      const promises = others.map(async (player) => {
        query = `SELECT count(*) as count from (SELECT * FROM games WHERE winners LIKE "%${me[0].name}-${me[0].id}%" and date > "${seasonStartDate}") AS sub WHERE winners LIKE "%${player.name}-${player.id}%" and map="Summoner's Rift";`;
        const teamWinCount = await conn.query(query);
        query = `SELECT count(*) as count from (SELECT * FROM games WHERE losers LIKE "%${me[0].name}-${me[0].id}%" and date > "${seasonStartDate}") AS sub WHERE losers LIKE "%${player.name}-${player.id}%" and map="Summoner's Rift";`;
        const teamLoseCount = await conn.query(query);
        query = `SELECT count(*) as count from (SELECT * FROM games WHERE winners LIKE "%${me[0].name}-${me[0].id}%" and date > "${seasonStartDate}") AS sub WHERE losers LIKE "%${player.name}-${player.id}%" and map="Summoner's Rift";`;
        const enemyWinCount = await conn.query(query);
        query = `SELECT count(*) as count from (SELECT * FROM games WHERE losers LIKE "%${me[0].name}-${me[0].id}%" and date > "${seasonStartDate}") AS sub WHERE winners LIKE "%${player.name}-${player.id}%" and map="Summoner's Rift";`;
        const enemyLoseCount = await conn.query(query);
        return {
          id: player.id,
          name: player.name,
          teamWins: teamWinCount[0].count,
          teamLoses: teamLoseCount[0].count,
          teamCount: teamWinCount[0].count + teamLoseCount[0].count,
          teamWinrate: winrate(
            teamWinCount[0].count,
            teamWinCount[0].count + teamLoseCount[0].count
          ),
          enemyWins: enemyWinCount[0].count,
          enemyLoses: enemyLoseCount[0].count,
          enemyCount: enemyWinCount[0].count + enemyLoseCount[0].count,
          enemyWinrate: winrate(
            enemyWinCount[0].count,
            enemyWinCount[0].count + enemyLoseCount[0].count
          ),
        };
      });
      return Promise.all(promises);
    };
    const results = await func();
    return res.send(results);
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.get("/games", async (req, res) => {
  const { page, limit } = req.query;
  let conn;
  try {
    conn = await pool.getConnection();
    var query = `select * from games where red is not null and date > "2021-03-06" order by id desc limit ${
      limit || 1000
    } offset ${page * limit - limit || 0};`;
    var games = await conn.query(query);

    var query = `select count(*) as count from games where red is not null and date > "2021-03-06"`;
    var total = await conn.query(query);

    res.send({ total: total[0].count, games });
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.listen(port, () => {
  console.log(`Randomizer-api listening at http://localhost:${port}`);
});
