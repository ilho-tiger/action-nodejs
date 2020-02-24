"use strict";

const request = require("request");
const cheerio = require("cheerio");
const fs = require('fs');

function sendSlackMessage(message, incoming_webhook_url) {
    request.post(
        incoming_webhook_url,
        {
            json: {
                text: message
            }
        },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
            else {
                console.log("error: " + error);
            }
        }
    )
}

request("http://ncov.mohw.go.kr/bdBoardList_Real.do?brdId=&brdGubun=&ncvContSeq=&contSeq=&board_id=&gubun=", function (error, response, body) {
    if (error && response.statusCode !== 200) {
        console.error("error:", error);
        console.log("statusCode:", response && response.statusCode);
    }
    // console.log(body);
    // fs.writeFileSync('./body.html', body);
    const $ = cheerio.load(body);

    let resultString = ""
    resultString += $(".s_descript").first().text() + " - (한국시각)\n\n";
    $(".s_listin_dot").first().find("li").each((index, element) => {
        resultString += $(element).text() + "\n"
    });

    console.log(resultString);
    sendSlackMessage(resultString, "https://hooks.slack.com/services/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");
});
