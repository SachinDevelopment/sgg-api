const express = require("express");
const bodyParser = require("body-parser");
const port = 5000;
const app = express();
const cors = require("cors");

app.use(bodyParser.json());
app.use(cors());


app.listen(port, () => {
    console.log(`Randomizer-api listening at http://localhost:${port}`);
});
  
app.get('/health', async ( _, res) => {
    res.send({
        msg: "Hello world"
    })
})
