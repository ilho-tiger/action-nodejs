"use strict";

const request = require("request");
const cheerio = require("cheerio");
const fs = require('fs');

if (!process.env.slack_webhook) {
    console.log("No slack_webhook URL found");
    process.exit(1)
}
let slack_webhook = process.env.slack_webhook

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
    resultString += $(".s_descript").first().text() + " - (한국시각)\n";
    resultString += "대한민국 질병관리본부 제공 (http://ncov.mohw.go.kr)\n\n"

    let isFirst = true;

    $(".data_table").each(function () {
        if (isFirst) {
            isFirst = false;
            let heads = [];
            let bodies = [];
            $(this).children().find('thead').children().find('th').each(function() {
                heads.push($(this).text());
            });
            $(this).children().find('tbody').children().find('td').each(function () {
                bodies.push($(this).text());
            });
            
            for(let i=0;i<heads.length; i++){
                resultString += heads[i] + ": " + bodies[i] + "\n";
            }
        }
    });

    console.log(resultString);
    sendSlackMessage(resultString, slack_webhook);
});
