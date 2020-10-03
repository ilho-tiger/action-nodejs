package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/ilho-tiger/action-nodejs/persist"
	"github.com/ilho-tiger/action-nodejs/slack"
	"github.com/ilho-tiger/action-nodejs/zip"
)

const (
	gdphdData             string = "https://ga-covid19.ondemand.sas.com/docs/ga_covid_data.zip"
	rtData                string = "https://d14wlfuexuxgcm.cloudfront.net/covid/rt.csv"
	dataArchiveFilename   string = "./ga_covid_data.zip"
	dataPerCountyFilename string = "county_cases.csv"
	dataDir               string = "./dataToday"
	rtCsvFilename         string = "rt.csv"
)

const (
	positive        int = 1
	death               = 7
	hospitalization     = 6
)

type covidStat struct {
	Positive         int
	Death            int
	Hospitalization  int
	PerCountyRecords [][]string
}

func main() {
	sanityClean()

	newStat := constructCovidStatFromGDPHRecords(getDataFromGDPH())
	previousStat := loadPreviousData()
	rtRate := getRtData()

	processFinalData(newStat, previousStat, rtRate)

	sanityClean()
}

func loadPreviousData() covidStat {
	var stat2 covidStat
	if err := persist.Load("data.json", &stat2); err != nil {
		log.Fatal("Failed to load: ", err)
	}
	return stat2
}

func processFinalData(newStat covidStat, previousStat covidStat, rtRate float64) {
	now := time.Now()
	message := fmt.Sprintf("COVID-19 Daily Status Report (GA Only / %s)\n", now.Format("01-02-2006 15:04:05 MST"))
	message += fmt.Sprintf("Data from Georgia Department of Public Health (https://dph.georgia.gov/covid-19-daily-status-report)\n")
	message += fmt.Sprintf("Rt data from RT Covid Live (https://rt.live/us/GA)\n\n")
	message += fmt.Sprintf("(GA Total Confirmed) %d (%s)\n", newStat.Positive, getDifferenceString(previousStat.Positive, newStat.Positive))
	message += fmt.Sprintf("(GA Total Deaths) %d (%.2f%%, %s)\n", newStat.Death, getPercentRatio(newStat.Death, newStat.Positive), getDifferenceString(previousStat.Death, newStat.Death))
	message += fmt.Sprintf("(GA Total Hospitalization) %d (%.2f%%, %s)\n", newStat.Hospitalization, getPercentRatio(newStat.Hospitalization, newStat.Positive), getDifferenceString(previousStat.Hospitalization, newStat.Hospitalization))
	message += fmt.Sprintf("(GA Rt Infection Rate) %s\n\n", fmt.Sprintf("%.2f", rtRate))

	message += fmt.Sprintf("(Top 10 Counties in GA):\n")
	for i := 0; i < 10; i++ {
		countyName := newStat.PerCountyRecords[i][0]
		countyValue, err := strconv.Atoi(newStat.PerCountyRecords[i][positive])
		if err != nil {
			log.Fatal("Fail to parse", err)
		}
		previousValue, err := findCountyStat(countyName, previousStat)
		if err != nil {
			previousValue = 0
		}
		message += fmt.Sprintf("- %d: (%s) %d (%s)\n", i+1, countyName, countyValue, getDifferenceString(previousValue, countyValue))
	}
	slack.SendMessage(message)
	if slack.IsSlackEnabled() {
		if err := persist.Save("data.json", newStat); err != nil {
			log.Fatal("Fail to save stat as a file:", err)
		}
	}
}

func findCountyStat(countyName string, stat covidStat) (int, error) {
	for _, countyData := range stat.PerCountyRecords {
		if countyData[0] == countyName {
			countyValue, err := strconv.Atoi(countyData[positive])
			if err != nil {
				log.Fatal("Fail to parse", err)
			}
			return countyValue, nil
		}
	}
	return -1, fmt.Errorf("No county named %s found", countyName)
}

func getDifferenceString(oldValue, newValue int) string {
	diff := newValue - oldValue
	if diff >= 0 {
		return "+" + strconv.Itoa(diff)
	}
	return strconv.Itoa(diff)
}

func getPercentRatio(numerator, denominator int) float32 {
	return float32(numerator*100) / float32(denominator)
}

func constructCovidStatFromGDPHRecords(records [][]string) covidStat {
	stat := covidStat{}

	log.Println("Sorting by positive cases...")
	sortCovidData(records[1:], positive)
	stat.PerCountyRecords = records[1:] // save sorted data

	log.Println("Getting total summaries...")
	stat.Positive = sumCovidData(records[1:], positive)
	stat.Death = sumCovidData(records[1:], death)
	stat.Hospitalization = sumCovidData(records[1:], hospitalization)

	return stat
}

func getDataFromGDPH() [][]string {
	log.Println("Downloading GA COVID data...")
	downloadData(gdphdData, dataArchiveFilename)
	zip.Unzip(dataArchiveFilename, dataDir)
	log.Println("Parsing GA COVID data...")
	return csvReader(dataDir + "/" + dataPerCountyFilename)
}

func getRtData() float64 {
	log.Println("Downloading Rt data...")
	downloadData(rtData, rtCsvFilename)
	log.Println("Parsing Rt data...")
	data := csvReader(rtCsvFilename)
	gaOnly := filterByColValue(data, "region", "GA")
	latestRt, _ := strconv.ParseFloat(gaOnly[len(gaOnly)-1][3], 64)
	return latestRt
}

func filterByColValue(dataset [][]string, col string, value string) [][]string {
	var colIdx int = -1
	for idx, colName := range dataset[0] {
		if colName == col {
			colIdx = idx
			break
		}
	}
	if colIdx < 0 {
		return nil
	}

	var filteredDataSet [][]string
	for _, data := range dataset {
		if data[colIdx] == value {
			filteredDataSet = append(filteredDataSet, data)
		}
	}
	return filteredDataSet
}

func sumCovidData(records [][]string, col int) int {
	var sum int = 0
	for _, record := range records {
		value, err := strconv.Atoi(record[col])
		if err != nil {
			log.Fatal("Failed to parse case counts: ", err)
		}
		sum += value
	}
	return sum
}

func sortCovidData(records [][]string, sortByCol int) {
	sort.Slice(records, func(i, j int) bool {
		valuei, err := strconv.Atoi(records[i][sortByCol])
		if err != nil {
			log.Fatal("Failed to parse cases: ", err)
		}
		valuej, err := strconv.Atoi(records[j][sortByCol])
		if err != nil {
			log.Fatal("Failed to parse cases: ", err)
		}
		return valuei > valuej
	})
}

func sanityClean() {
	os.RemoveAll(dataDir)
	os.Remove(dataArchiveFilename)
}

func downloadData(fileURL string, pathToSave string) error {
	response, err := http.Get(fileURL)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	out, err := os.Create(pathToSave)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, response.Body)
	return err
}

func csvReader(filename string) [][]string {
	recordFile, err := os.Open(filename)
	if err != nil {
		log.Fatal("An error encountered ::", err)
	}

	reader := csv.NewReader(recordFile)
	records, err := reader.ReadAll()
	if err != nil {
		log.Fatal(err)
	}
	return records
}
