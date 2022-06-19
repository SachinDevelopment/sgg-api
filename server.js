const app = require("express")();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const bodyParser = require("body-parser");

const port = 5000;
const cors = require("cors");
const pool = require("./db");
// ratings constants
const k = 40;
const diff = 1200;
const inflationRate = 1.25;

// Season info
const currentSeason = 2;
const previousSeason = 2;
//const season1StartDate = "2021-03-06"
//const season2StartDate = "2021-03-25";
// const season3StartDate = "2021-05-31";
const seasonStartDate = "2021-03-25";

app.use(bodyParser.json());
app.use(
  cors({
    origin: "*",
  })
);

const getPlayerData = async (conn) => {
  // create a new query
  var query = `select p.*,prev.rating as prev_rating from players p left join players_season_${previousSeason} prev on p.id=prev.id`;
  const getFavChamps = (id, name, allChamps) => {
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
  const getPlayerAndFavChamps = () => {
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
      const srChampWrArr = await getFavChamps(player.id, player.name, srChamps);

      return {
        ...player,
        fav_champs: srChampWrArr
          .sort((a, b) => b.count - a.count || b.wins - a.wins)
          .splice(0, 5),
      };
    });
    return Promise.all(rows);
  };

  return await getPlayerAndFavChamps();
};

const getRandomizerState = async (conn) => {
  const query = "select * from randomizer_state";
  var rows = await conn.query(query);
  return rows;
};

app.get("/players", async (req, res) => {
  let conn;
  try {
    // establish a connection to MariaDB
    conn = await pool.getConnection();
    const playerData = await getPlayerData(conn);
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
    srChamps = srChamps.map(
      (c) =>
        c.red.match(`${id}.*-(.*)-${name}-${id}`) ||
        c.blue.match(`${id}.*-(.*)-${name}-${id}`)
    );
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
    var query = `select * from games where (winners rlike "${name}-${id}" or losers rlike "${name}-${id}") and date > "${seasonStartDate}" and  map="${mapF}" order by id desc limit ${
      limit || 1000
    } offset ${page * limit - limit || 0};`;

    var rows = await conn.query(query);

    var query = `select count(*) as count from games where (winners rlike "${name}-${id}" or losers rlike "${name}-${id}") and date > "${seasonStartDate}" and map="${mapF}";`;
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
     else if (row.winning_side === "red") {
        winner = redPlayers.some((element) => {
          const [, , , player] = element.split("-");
          return player === name;
        });
      } 

      const ratingChange = winner ? row.winner_rating : row.loser_rating;
      let redTeam = redPlayers.map((player) => {
        const [id, role, champ, playerName] = player.split("-");
        return { id, role, player: playerName, champ };
      });
      if(redTeam[0]?.id === 'NULL'){
        redTeam = [];
      }
      let blueTeam = bluePlayers.map((player) => {
        const [id, role, champ, playerName] = player.split("-");
        return { id, role, player: playerName, champ };
      });
      if(blueTeam[0]?.id === 'NULL'){
        blueTeam = [];
      }
      const me = [...redTeam, ...blueTeam]?.find(
        (e) => e.player === name
      );

      let myChamp;
      if(me) {
        myChamp = me.champ;
      }
    
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
    var query = `select * from games where date > ${seasonStartDate} order by id desc limit ${
      limit || 1000
    } offset ${page * limit - limit || 0};`;
    var games = await conn.query(query);

    var query = `select count(*) as count from games where red is not null and date > ${seasonStartDate}`;
    var total = await conn.query(query);

    res.send({ total: total[0].count, games });
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.get("/randomizer/state", async (_,res) => {
  return res.send(await getInitState());
});
// TODO: add jwt verification to this end point
app.post("/lol/games", async (req, res) => {
  const {
    map,
    game_size,
    winners,
    losers,
    winning_side,
    winnerIds,
    loserIds,
    blue,
    red,
    date,
  } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    var query = `UPDATE players SET wins=wins+1 WHERE id in (${winnerIds});`;
    await conn.query(query);

    var query = `UPDATE players SET loses=loses+1 WHERE id in (${loserIds});`;
    await conn.query(query);

    var query = `UPDATE players SET winrate=Round(wins/(loses+wins)*100,0) WHERE loses+wins != 0;`;
    await conn.query(query);

    var query = `select sum(rating) as winnerSum from players where id in (${winnerIds});`;
    let [winnerResult] = await conn.query(query);
    let { winnerSum } = winnerResult;
    winnerSum /= game_size;

    var query = `select sum(rating) as loserSum from players where id in (${loserIds});`;
    let [loserResult] = await conn.query(query);
    let { loserSum } = loserResult;
    loserSum /= game_size;

    const probability1 = 1 / (1 + Math.pow(10, (loserSum - winnerSum) / diff));
    const probability2 = 1 / (1 + Math.pow(10, (winnerSum - loserSum) / diff));
    const winnerRating = Number(k * (1 - probability1) * inflationRate).toFixed(
      0
    );
    const loserRating = Number(
      (k * (0 - probability2)) / inflationRate
    ).toFixed(0);

    var query = `update players set rating=rating+${winnerRating} where id in (${winnerIds});`;
    await conn.query(query);
    var query = `update players set rating=rating+${loserRating} where id in (${loserIds});`;
    await conn.query(query);
    var query = `INSERT INTO games (game_size, winning_side, winners, losers, blue, red, date, map, winner_rating, loser_rating) VALUES (${game_size}, "${winning_side}", "${winners}", "${losers}",  "${blue}", "${red}", "${date}", "${map}",${winnerRating},${loserRating});`;
    await conn.query(query);

    res.sendStatus(200);
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.post("/lol/games/dodge", async (req, res) => {
  const {
    map,
    game_size,
    losers,
    loserId,
    blue,
    red,
    date,
  } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    let query = `UPDATE players SET dodges=dodges+1, rating=rating-${game_size * 5}  WHERE id = (${loserId});`;
    console.log("player dodge query", query)
    await conn.query(query);

    query = `INSERT INTO games (game_size, losers, blue, red, date, map, winner_rating, loser_rating, dodged) VALUES (${game_size}, "${losers}", "${blue}", "${red}", "${date}", "${map}", 0, ${game_size * 5}, 1);`;
    console.log("game dodge query", query)
    await conn.query(query);
    res.sendStatus(200);
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.post("/user", async (req, res) => {
  const { login_id, email, name } = req.body;
  let conn;
  try {
    // establish a connection to MariaDB
    conn = await pool.getConnection();
    var query = `insert IGNORE into users (login_id, email, name) values ('${login_id}','${email}', '${name}')`;
    await conn.query(query);
    return res.sendStatus(200);
  } catch (err) {
    throw err;
  } finally {
    if (conn) return conn.release();
  }
});

app.get("/user/:loginId", async (req, res) => {
  console.log('test');
const { loginId } = req.params
 
const conn = await pool.getConnection();
try {
  const [player] = await conn.query(
    `select players.*, login_id, email from players
    left join users on players.user_id = users.id
    where users.login_id = '${loginId}'`
  );
  if(!player) {
    res.sendStatus(404)
  }

  res.send(player);
} catch (err) {
  throw err;
} finally {
  if (conn) conn.release();
}
});

app.get("/health", (_, res) => {
  res.send({ status: "up" });
});

http.listen(port, () => {
  console.log(`Randomizer-api listening at http://localhost:${port}`);
});

const randomize = async (selected) => {
  const conn = await pool.getConnection();
  const len = selected.length;

  if (len < 4 || len % 2 !== 0 || len > 10) {
    return;
  }
  let availablePlayers;
  try {
    availablePlayers = await getPlayerData(conn);
  } catch (err) {
    throw err;
  }
  const playerClone = availablePlayers.filter((p) =>
    selected.some((s) => s.id === p.id)
  );
  playerClone.forEach((player) => (player.champion = "Champion"));
  playerClone.sort((a, b) => {
    const bGames = b.wins + b.loses;
    const aGames = a.wins + a.loses;
    const val =
      !!(bGames >= 10) - !!(aGames >= 10) ||
      !!(bGames > 0) - !!(aGames > 0) ||
      b.rating - a.rating ||
      b.wins - a.wins;
    return val;
  });
  const rTeam = [];
  const bTeam = [];

  while (playerClone.length > 0) {
    rTeam.push(
      ...playerClone.splice(Math.floor(Math.random() * playerClone.length), 1)
    );
    bTeam.push(
      ...playerClone.splice(Math.floor(Math.random() * playerClone.length), 1)
    );
  }

  try {
    const rTeamCleaned = JSON.stringify(rTeam).replace(/'/g, "\\'");
    const bTeamCleaned = JSON.stringify(bTeam).replace(/'/g, "\\'");
    await conn.query("update randomizer_state set red = ?, blue = ?", [
      rTeamCleaned,
      bTeamCleaned,
    ]);
  } catch (err) {
    throw err;
  } finally {
    if (conn) conn.release();
  }
  return { red: rTeam, blue: bTeam };
};

const getInitState = async () => {
  const conn = await pool.getConnection();
  let randomizerState;
  try {
    [randomizerState] = await getRandomizerState(conn);
  } catch (err) {
    throw err;
  } finally {
    if (conn) conn.release();
  }
  let { selected, blue, red } = randomizerState;
  red = JSON.parse(red.replace(/\\/g, ""));
  blue = JSON.parse(blue.replace(/\\/g, ""));
  selected = JSON.parse(selected.replace(/\\/g, ""));
  return { selected, blue, red };
};

const updateRed = async (inputRed) => {
  const conn = await pool.getConnection();
  let randomizerState;
  try {
    const rTeamCleaned = JSON.stringify(inputRed).replace(/'/g, "\\'");
    await conn.query("update randomizer_state set red = ?", [rTeamCleaned]);

    [randomizerState] = await getRandomizerState(conn);
    const { red } = randomizerState;
    const redParsed = JSON.parse(red.replace(/\\/g, ""));
    return { red: redParsed };
  } catch (err) {
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

const updateBlue = async (inputBlue) => {
  const conn = await pool.getConnection();
  let randomizerState;
  try {
    const blueTeamCleaned = JSON.stringify(inputBlue).replace(/'/g, "\\'");
    await conn.query("update randomizer_state set blue = ?", [blueTeamCleaned]);

    [randomizerState] = await getRandomizerState(conn);
    const { blue } = randomizerState;
    const blueParsed = JSON.parse(blue.replace(/\\/g, ""));
    return { blue: blueParsed };
  } catch (err) {
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

const updateSelected = async (inputSelected) => {
  const conn = await pool.getConnection();
  let randomizerState;
  try {
    const selectedCleaned = JSON.stringify(inputSelected).replace(/'/g, "\\'");
    await conn.query("update randomizer_state set selected = ?", [
      selectedCleaned,
    ]);

    [randomizerState] = await getRandomizerState(conn);
    const { selected } = randomizerState;
    const selectedParsed = JSON.parse(selected.replace(/\\/g, ""));
    return { selected: selectedParsed };
  } catch (err) {
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

const getPlayerIdFromUserId = async (userId) => {
  const conn = await pool.getConnection();
  try {
    const [playerId] = await conn.query(
      `select players.id from users left join players on users.id = players.user_id where users.login_id = '${userId}'`
    );
    const { id } = playerId;
    return id;
  } catch (err) {
    throw err;
  } finally {
    if (conn) conn.release();
  }
};



const onlinePlayers = new Map();

io.on("connection", async (socket) => {
  socket.on("disconnect", async () => {
    const playerId = await onlinePlayers.get(socket.id);
    console.log('disconnecting', playerId)
    onlinePlayers.delete(socket.id);
    io.emit(
      "playerOnline",
      Array.from(onlinePlayers.values())
    );
  });

  socket.emit("playerOnline",  Array.from(onlinePlayers.values()));

  socket.on("randomize", async (selected) => {
    console.log('random input', selected);
    const random = await randomize(selected)
    console.log('random output', random)
    io.emit("randomized", random);
  });

  socket.on("redUpdate", async (red) => {
    socket.broadcast.emit("redUpdated", await updateRed(red));
  });

  socket.on("blueUpdate", async (blue) => {
    socket.broadcast.emit("blueUpdated", await updateBlue(blue));
  });

  socket.on("selectedUpdate", async (selected) => {
    socket.broadcast.emit(
      "selectedUpdated",
      await updateSelected(selected)
    );
  });

  socket.on("online", async (userId) => {
    const playerId = await getPlayerIdFromUserId(userId)
    await onlinePlayers.set(socket.id, playerId);
    io.emit(
      "playerOnline",
      Array.from(onlinePlayers.values())
    );
  });
});
