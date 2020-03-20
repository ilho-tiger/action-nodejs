"use strict";

const request = require("request");
const cheerio = require("cheerio");
const Papa = require("papaparse");
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

function getTwoDigitPaddedNumberString(number) {
    return number < 10 ? '0' + number : number;
}

function getStatMessageString(totalNumbersInUs, postfix_to_prop = "") {
    let resultString = "";
    for (var prop in totalNumbersInUs) {
        if (totalNumbersInUs.hasOwnProperty(prop)) {
            resultString += "(" + prop + postfix_to_prop + ") " + totalNumbersInUs[prop] + "\n";
        }
    }
    return resultString;
}

let getKoreaStatus = function () {
    request("http://ncov.mohw.go.kr/bdBoardList_Real.do?brdId=&brdGubun=&ncvContSeq=&contSeq=&board_id=&gubun=", function (error, response, body) {
        if (error && response.statusCode !== 200) {
            console.error("error:", error);
            console.log("statusCode:", response && response.statusCode);
        }
        // console.log(body);
        // fs.writeFileSync('./data.html', body);
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
                $(this).children().find('thead').children().find('th').each(function () {
                    heads.push($(this).text());
                });
                $(this).children().find('tbody').children().find('td').each(function () {
                    bodies.push($(this).text());
                });

                for (let i = 0; i < heads.length; i++) {
                    resultString += "(" + heads[i] + ") " + bodies[i] + " 명\n";
                }
            }
        });

        console.log(resultString);
        sendSlackMessage(resultString, slack_webhook);
    });
};

let getUsStatus = function () {
    let today = new Date();
    let dateFormat = getTwoDigitPaddedNumberString(today.getMonth() + 1) + "-" + getTwoDigitPaddedNumberString(today.getDate() - 1) + "-" + today.getFullYear();

    let resultString = "";
    resultString += "COVID-19 Daily Report (US Only / " + dateFormat + " 23:59 UTC, 19:59 EDT)\n";
    resultString += "Data taken from Johns Hopkins CSSE Dataset (https://github.com/CSSEGISandData/COVID-19)\n\n"
    request("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_daily_reports/" + dateFormat + ".csv", function (error, response, body) {
        if (error && response !== 200) {
            console.error("error:", error);
            console.log("statusCode:", response && response.statusCode);
        }

        // fs.writeFileSync('./data.csv', body);
        let dailyReport = Papa.parse(body);
        let headerToFind = [
            {
                "title": "Confirmed", "index": 0
            },
            {
                "title": "Deaths", "index": 0
            },
            {
                "title": "Recovered", "index": 0
            }
        ];
        headerToFind.forEach(element => {
            element.index = dailyReport.data[0].findIndex(title => title === element.title);
        });

        let totalNumbersInUs = {
            Confirmed: 0,
            Deaths: 0,
            Recovered: 0
        };
        let numbersInGa = {
            Confirmed: 0,
            Deaths: 0,
            Recovered: 0
        }
        dailyReport.data.forEach(element => {
            if (element[1] === "US") {
                headerToFind.forEach(header => {
                    let value = element[header.index];
                    totalNumbersInUs[header.title] += Number(value);
                    if (element[0] === "Georgia") {
                        numbersInGa[header.title] += Number(value);
                    }
                });

            }
        });

        resultString += getStatMessageString(totalNumbersInUs) + "\n";
        resultString += getStatMessageString(numbersInGa, " in GA")
        console.log(resultString);
        sendSlackMessage(resultString, slack_webhook);
    });
}

let getGaStatus = function () {
    request("https://dph.georgia.gov/covid-19-daily-status-report", function (error, response, body) {
        if (error && response !== 200) {
            console.error("error:", error);
            console.log("statusCode:", response && response.statusCode);
        }

        // fs.writeFileSync('./data.html', body);
        let gaTotal = {
            Total: "",
            Deaths: ""
        };
        let topTenCounties = [];
        let reportGenerated = "";

        const $ = cheerio.load(body);
        $(".stacked-row-plus").each(function () {
            let caption = $(this).find("caption").text();
            if (caption.includes('Confirmed cases and deaths in Georgia')) {
                $(this).find('tbody').find('tr').each(function () {
                    let element = $(this).text();
                    let split = element.split('\n');
                    gaTotal[split[0]] = split[1];
                });
            }
            else if(caption.includes('by County')){
                let counties = [];
                $(this).find('tbody').find('tr').each(function(){
                    let element = $(this).text();
                    let split = element.split('\n');
                    counties.push(split);
                });
                topTenCounties = counties.slice(0, 10);
            }
        });

        $(".body-content").children().find("em").each(function(){
            let element = $(this).text();
            if(element.includes("generated on:")){
                reportGenerated = element.split(': ')[1] + " EDT";
            }
        })

        // console.log(gaTotal);
        // console.log(topTenCounties);
        // console.log(reportGenerated);



    });
}

// getKoreaStatus();
// getUsStatus();
getGaStatus();