"use strict";

const fetch = require("node-fetch");
const cheerio = require("cheerio");
const Papa = require("papaparse");
const fs = require('fs');

const result_file = "./result/data.json";

if (!process.env.slack_webhook) {
    console.log("No slack_webhook URL found");
    process.exit(1)
}
let slack_webhook = process.env.slack_webhook;

let enableSlack = false;
if (process.env.action_slack !== undefined && process.env.action_slack === 'true') {
    enableSlack = true;
    console.log("action_slack is set to true: Slack message enabled");
}
else {
    enableSlack = false;
    console.log("action_slack is set to false: Slack message disabled");
}

function addPrefix(str, prefix) {
    let tmp = str.split('\n'),
        res = [];

    for (const frag of tmp) {
        res.push(`${prefix} ${frag}`);
    }

    return res.join('\n');
}

async function sendSlackMessage(message, incoming_webhook_url) {
    if (enableSlack === true) {
        const headers = {
            "Content-Type": "application/json",
        }
        const response = await fetch(incoming_webhook_url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                text: message
            })
        });

        if (response.status != 200) {
            console.log("error: " + await response.text());
        }
        else {
            console.log("message sent");
        }
    }
    else {
        // fs.appendFileSync(result_file, message + "\n");
        message = addPrefix(message, "onSlack > ")
        console.log(message);
    }
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

async function getBodyFromUrl(url) {
    const response = await fetch(url);
    return await response.text();
}

let getKoreaStatus = async function () {
    const body = await getBodyFromUrl("http://ncov.mohw.go.kr/bdBoardList_Real.do?brdId=&brdGubun=&ncvContSeq=&contSeq=&board_id=&gubun=");

    // console.log(body);
    // fs.writeFileSync('./data.html', body);
    const $ = cheerio.load(body);

    let resultString = ""
    resultString += $(".s_descript").first().text() + " - (한국시각)\n";
    resultString += "대한민국 질병관리본부 제공 (http://ncov.mohw.go.kr)\n\n"

    let jsonData = {
        title: $(".s_descript").first().text() + " - (한국시각)",
        credit: "대한민국 질병관리본부 제공 (http://ncov.mohw.go.kr)",
        timestamp: $(".s_descript").first().text() + " - (한국시각)",
        confirmed: 0,
        death: 0,
        recovered: 0,
        active: 0
    };

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
                let number = parseInt(bodies[i].replace(/,/g, ''));
                switch (heads[i]) {
                    case '확진환자':
                        jsonData.confirmed = number;
                        break;
                    case '격리해제':
                        jsonData.recovered = number;
                        break;
                    case '격리중':
                        jsonData.active = number;
                        break;
                    case '사망':
                        jsonData.death = number;
                        break;
                    default:
                        break;
                }
            }
        }
    });

    sendSlackMessage(resultString, slack_webhook);
    return jsonData;
};

let getUsStatus = async function () {
    let today = new Date();
    let dateFormat = getTwoDigitPaddedNumberString(today.getMonth() + 1) + "-" + getTwoDigitPaddedNumberString(today.getDate() - 1) + "-" + today.getFullYear();

    let resultString = "";
    resultString += "COVID-19 Daily Report (US Only / " + dateFormat + " 23:59 UTC, 19:59 EDT)\n";
    resultString += "Data taken from Johns Hopkins CSSE Dataset (https://github.com/CSSEGISandData/COVID-19)\n\n"
    const body = await getBodyFromUrl("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_daily_reports/" + dateFormat + ".csv");

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
        if (element[3] === "US") {
            headerToFind.forEach(header => {
                let value = element[header.index];
                totalNumbersInUs[header.title] += Number(value);
                if (element[2] === "Georgia") {
                    numbersInGa[header.title] += Number(value);
                }
            });

        }
    });

    resultString += getStatMessageString(totalNumbersInUs) + "\n";
    resultString += getStatMessageString(numbersInGa, " in GA")
    sendSlackMessage(resultString, slack_webhook);

    let jsonData = {
        title: "COVID-19 Daily Report",
        credit: "Johns Hopkins CSSE Dataset (https://github.com/CSSEGISandData/COVID-19)",
        timestamp: dateFormat + " 23:59 UTC, 19:59 EDT",
        confirmed: totalNumbersInUs.Confirmed,
        death: totalNumbersInUs.Deaths,
        recovered: totalNumbersInUs.Recovered
    };
    return jsonData;
}

let getGaStatus = async function () {
    // const body = await getBodyFromUrl("https://dph.georgia.gov/covid-19-daily-status-report");
    const body = await getBodyFromUrl("https://d20s4vd27d0hk0.cloudfront.net/");

    fs.writeFileSync('./data.html', body);
    let gaTotal = {
        Total: "",
        Hospitalized: "",
        Deaths: ""
    };
    let topTenCounties = [];
    let reportGenerated = "";

    const $ = cheerio.load(body);
    $("#cont1").each(function () {
        $(this).find("table").each(function () {
            if ($(this).text().includes("COVID-19 Confirmed Cases:")) {
                $(this).children().find("tr").each(function () {
                    let cells = $(this).find("td");
                    if (cells.length > 1) {
                        let text = $(cells[0]).text();
                        if (text === "Total" || text === "Hospitalized" || text === "Deaths") {
                            gaTotal[text] = $(cells[1]).text();
                        }
                    }
                });
            }
            if ($(this).text().includes("COVID-19 Confirmed Cases By County:")) {
                $(this).children().find("tr").each(function() {
                    let cells = $(this).find("td");
                    if(cells.length > 1 && $(cells[0]).text() !== "COVID-19 Confirmed Cases By County:") {
                        let countyName = $(cells[0]).text();
                        let value = $(cells[1]).text();
                        topTenCounties.push([countyName, value.trim()]);
                    }
                });              
            }
        });
    });

    topTenCounties = topTenCounties.slice(0, 10);

    $("i").each(function () {
        let element = $(this).text();
        if (element.includes("Generated On :")) {
            reportGenerated = element.split(': ')[1] + " EDT";
        }
    })

    let message = "";
    message += "COVID-19 Daily Status Report (GA Only / " + reportGenerated + ")\n";
    message += "Data from Georgia Department of Public Health (<https://dph.georgia.gov/covid-19-daily-status-report>)\n\n";

    message += "(GA Total Confirmed) " + gaTotal.Total + "\n";
    message += "(GA Total Deathes) " + gaTotal.Deaths + "\n\n";

    message += "(Top 10 Counties in GA):\n";


    let confirmed = parseInt(gaTotal.Total.split(' ')[0]);
    let death = parseInt(gaTotal.Deaths.split(' ')[0]);
    let jsonData = {
        title: "COVID-19 Daily Status Report",
        credit: "Georgia Department of Public Health (<https://dph.georgia.gov/covid-19-daily-status-report>)",
        timestamp: reportGenerated,
        confirmed: confirmed,
        death: death,
        recovered: 0,
        extra: {
            perCounties: []
        }
    };

    let index = 1;
    topTenCounties.forEach(county => {
        message += "- " + index + ": " + county[0] + " (" + county[1] + ")\n";
        jsonData.extra.perCounties.push({
            rank: index,
            name: county[0],
            confirmed: county[1]
        });
        index++;
    });

    sendSlackMessage(message, slack_webhook);
    return jsonData;
}

async function main() {

    let today = new Date();
    let krData, usData, gaData;

    krData = await getKoreaStatus();
    usData = await getUsStatus();
    gaData = await getGaStatus();

    let data = {
        timestamp: today.toISOString(),
        kr: krData,
        us: usData,
        ga: gaData
    };
    // console.log(JSON.stringify(data));
    fs.writeFileSync(result_file, JSON.stringify(data, null, 4));

}

main();