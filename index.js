const request = require("request");
const cheerio = require("cheerio");
const fs = require('fs');

request("http://ncov.mohw.go.kr/bdBoardList_Real.do?brdId=&brdGubun=&ncvContSeq=&contSeq=&board_id=&gubun=", function (error, response, body) {
    if (error && response.statusCode !== 200) {
        console.error("error:", error);
        console.log("statusCode:", response && response.statusCode);
    }
    // console.log(body);
    fs.writeFileSync('./body.html', body);
    const $ = cheerio.load(body);
    $(".s_listin_dot").first().find("li").each((index, element) => {
        console.log($(element).text());
    });
});