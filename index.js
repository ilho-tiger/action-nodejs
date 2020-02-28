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
    $(".num").each(function () {
        if (isFirst) {
            $(this).children().find('tr').each(function () {
                let title = $(this).find('th').text();
                let value = $(this).find('td').text();
                resultString += "(" + title + ") " + value + "\n";
                isFirst = false;
            });
        }
        else {
            $(this).children().find('tr').each(function() {
                if($(this).text().includes("미국")){
                    let title = "\n(미국 발생현황)"
                    let value = $(this).find('td:not(.w_bold)').text();
                    resultString += title + " " + value + "\n";
                }
            });
        }
    });

    console.log(resultString);
    sendSlackMessage(resultString, slack_webhook);
});
