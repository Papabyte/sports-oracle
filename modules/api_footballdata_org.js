/*jslint node: true */
"use strict";
const moment = require('moment');
const request = require('request');
const calendar = require('./calendar.js');
const conf = require('byteballcore/conf.js');
const commons = require('./commons.js');
const notifications = require('./notifications.js');

var reloadInterval = 1000*3600*24;
/*
	var headers = {
		'X-Auth-Token': conf.footballDataApiKey
	};
console.log(headers);
		request({
				url: "http://api.football-data.org/v2/competitions/2001/matches",
				headers: headers
			}, function(error, response, body) {
			
			console.log(body);
		});
*/


function getFixturesAndPushIntoCalendar(category, championship, url) {

	var headers = {
		'X-Auth-Token': conf.footballDataApiKey
	};

	var firstCalendarLoading = true;
	
	var resultHelper = {};
	resultHelper.headers = headers;
	resultHelper.hoursToWaitBeforeGetResult = 4;
	resultHelper.rules = "The oracle will post the name of winning team after 90 minutes play. This includes added injury or stoppage time but doesn't include extra-time, penalty shootouts or golden goal. If the match is rescheduled to another day, no result will be posted.";
	resultHelper.process = function(response, expectedFeedName, handle) {
		if (response.status == "FINISHED") {
			if (response.score && response.score.fullTime.homeTeam != null) {
					let fixture = encodeFixture(response);
						if (fixture.feedName === expectedFeedName){
							if (Number(response.score.fullTime.awayTeam) > Number(response.score.fullTime.homeTeam)) {
								fixture.winner = fixture.awayTeam;
								fixture.winnerCode = fixture.feedAwayTeamName;
							}
							if (Number(response.score.fullTime.awayTeam) < Number(response.score.fullTime.homeTeam)) {
								fixture.winner = fixture.homeTeam;
								fixture.winnerCode = fixture.feedHomeTeamName;
							}
							if (Number(response.score.fullTime.awayTeam) == Number(response.score.fullTime.homeTeam)) {
								fixture.winner = 'draw';
								fixture.winnerCode = 'draw';
							}
							handle(null, fixture);
							
							} else {
								handle('The feedname is not the expected one, feedname found: ' + fixture.feedName);	
							}
					} else {
						handle('No result in response');
					}
				
		} else {
			handle('Fixture is not finished');
		}
	};
	
	calendar.addResultHelper(category, championship, resultHelper);
	
	function encodeFixture(fixture) {
		let homeTeamName = commons.removeAbbreviations(fixture.homeTeam.name);
		let awayTeamName = commons.removeAbbreviations(fixture.awayTeam.name);
		let feedHomeTeamName = homeTeamName.replace(/\s/g, '').toUpperCase();
		let feedAwayTeamName = awayTeamName.replace(/\s/g, '').toUpperCase();
		let localDay = moment.utc(fixture.utcDate);
		if (fixture.season.id == 2013){ //for bresil championship we convert UTC time to local time approximately
			localDay.subtract(4, 'hours');
		}
		return {
			homeTeam: homeTeamName,
			awayTeam: awayTeamName,
			feedHomeTeamName: feedHomeTeamName,
			feedAwayTeamName: feedAwayTeamName,
			feedName: feedHomeTeamName + '_' + feedAwayTeamName + '_' + localDay.format("YYYY-MM-DD"),
			urlResult: "http://api.football-data.org/v2/matches/"+ fixture.id,
			date: moment.utc(fixture.utcDate),
			localDay: localDay
		}
	}

	function loadInCalendar() {
		request({
				url: url,
				headers: headers
			}, function(error, response, body) {
				if (error || response.statusCode !== 200) {
					if (firstCalendarLoading) {
						throw Error('couldn t get fixtures from footballDataOrg ' + url + '\n' + body);
					} else {
						return notifications.notifyAdmin("I couldn't get " + championship + " calendar today", "");
					}
				}

				try {
					var jsonResult = JSON.parse(body);
					var arrRawFixtures = jsonResult.matches;
				} catch (e) {
					if (firstCalendarLoading) {
						throw Error('error parsing football-data response: ' + e.toString() + ", response: " + body);
					} else {
						return notifications.notifyAdmin("I couldn't parse " + championship + " today", "");
					}
				}
				if (arrRawFixtures.length == 0) {
					if (firstCalendarLoading) {
						throw Error('fixtures array empty, couldn t get fixtures from footballDataOrg');
					} else {
						return notifications.notifyAdmin("I couldn't get fixtures from " + championship + " today", "");
					}
				}


				var arrFixtures = arrRawFixtures.map(fixture => {
					return encodeFixture(fixture);
				});
				calendar.setReloadingFlag(championship, true);
				calendar.deleteAllFixturesFromChampionship(championship);
			
				arrFixtures.forEach(function(fixture) {
					if (fixture.date.diff(moment(),'days') > -15 && fixture.date.diff(moment(),'days') < 30){
						calendar.addFixture(category, championship, fixture.feedName, fixture);
					}
				});
				calendar.setReloadingFlag(championship, false);
				firstCalendarLoading = false;
			}

		);
	}

	loadInCalendar();
	setInterval(loadInCalendar, reloadInterval);
}


exports.getFixturesAndPushIntoCalendar = getFixturesAndPushIntoCalendar;