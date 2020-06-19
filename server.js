// App configuration stuff
var express = require("express");
var app = express();
app.use(express.static(__dirname + "/"));

// Other dependencies
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var fs = require("fs");
fs.readFile(__dirname + "/game/functions.json", (err, data) => 
{
	if(err) 
		throw err;
	full_questions = JSON.parse(data);
});

// Default username
var username = "Guest";

// Player stuff with default values
// Index 0 is player 1, index 1 is player 2.
var players = [{"username": "Waiting on player 1..."}, {"username": "Waiting on player 2..."}];
var next_player = 0;

// Game data
var game = {};
var fs = require("fs");
fs.readFile(__dirname + "/game/functions.json", (err, data) => 
{
	if(err) 
		throw err;
	game.full_questions = JSON.parse(data);
});

// Index route
app.get("/", function(request, response)
{
	response.sendFile(__dirname + "/connect/connect.html");
});

// When someone connects to the username page.
io.on("connection", function(socket)
{
	// Save some player information
	socket.on("player_enter", function(username, callback)
	{
		if(next_player < 2)
		{
			if(username.length > 20)
				callback("too long");
			else
			{
				players[next_player].socket = socket;
				if(next_player == 1 && username == players[0].username)
				{
					callback("name taken");
				}
				else
				{
					players[next_player++].username = username;
					callback("ok");
				}
			}
		}
		else
		{
			callback("full");
		}
	});
	
	// Send the script some configuration stuff
	socket.on("config", function(callback)
	{
		var data = {
			"player": next_player
		};
		callback(data);
	});
	
	socket.on("ready_to_collect_data", function()
	{
		io.emit("get_names", players[0].username, players[1].username);
		
		// Both players are in the lobby.
		if(next_player == 2)
			io.emit("ready_up");
	});
	
	socket.on("p1_ready", function()
	{
		players[0].ready = true;
		io.emit("border_change", 1);
		if(players[0].ready && players[1].ready)
		{
			getCards();
			io.emit("memorization_start", [game.p1_final_slots, game.p2_final_slots]);
			game.num_ready = 0;
		}
	});
	
	socket.on("p2_ready", function()
	{
		players[1].ready = true;
		io.emit("border_change", 2);
		if(players[0].ready && players[1].ready)
		{
			getCards();
			io.emit("memorization_start", [game.p1_final_slots, game.p2_final_slots]);
			game.num_ready = 0;
		}
	});
	
	socket.on("mem_skip", function(skip_votes)
	{
		if(!skip_votes)
			io.emit("update_votes", ++game.num_ready);
		else
			game.num_ready = 2;
		
		if(game.num_ready == 2)
		{
			if(!game.started)
				io.emit("game_start", "ok");
			game.started = true;
			game.next_card_index = 0;
			game.players_requesting_next_card = 0;
			
		}
	});
	
	socket.on("get_next_card", function()
	{
		game.players_requesting_next_card++;
		if(game.players_requesting_next_card == 2)
		{
			game.players_requesting_next_card = 0;
			game.players_requesting_fault = 0;
			game.players_requesting_slot_calc = 0;
			game.next_answer = game.reader_cards[game.next_card_index++];
			game.next_function_list = game.full_questions[(game.next_answer - 1).toString()][game.next_answer.toString()];
			game.next_function = game.next_function_list[Math.floor(Math.random()*game.next_function_list.length)];
			
			var dead = true;
			for(var i = 0; i < game.p1_cards.length; i++)
			{
				if(game.next_answer == game.p1_cards[i])
				{
					dead = false;
					break;
				}
			}
			if(dead)
			{
				for(var i = 0; i < game.p2_cards.length; i++)
				{
					if(game.next_answer == game.p2_cards[i])
					{
						dead = false;
						break;
					}
				}
			}
			io.emit("next_card_delivery", [game.next_function, game.next_answer, dead]);
		}
	});
	
	socket.on("submit_card", function(card_num, player_who_submitted)
	{
		// Determine if card is dead *or* find board card is on
		var correct_board = -1;
		var dead = true;
		for(var i = 0; i < game.p1_cards.length; i++)
		{
			if(game.next_answer == game.p1_cards[i])
			{
				correct_board = 1;
				dead = false;
				break;
			}
		}
		if(dead)
		{
			for(var i = 0; i < game.p2_cards.length; i++)
			{
				if(game.next_answer == game.p2_cards[i])
				{
					correct_board = 2;
					dead = false;
					break;
				}
			}
		}
		
		// Find board containing card which was clicked (not necessarily correct)
		var board = -1;
		for(var i = 0; i < game.p1_cards.length; i++)
		{
			if(card_num == game.p1_cards[i])
			{
				board = 1;
				break;
			}
		}
		if(board != 1)
		{
			for(var i = 0; i < game.p2_cards.length; i++)
			{
				if(card_num == game.p2_cards[i])
				{
					board = 2;
					break;
				}
			}
		}
		
		// Get the correct card and see if their click is correct
		var correct = card_num == game.next_answer;
		var correct_card = game.next_answer;
		
		// Other config stuff to prevent doubling up on emissions
		game.remove_requests = 0;
		
		// Send all the information
		io.emit("card_submission", card_num, board, correct, correct_card, correct_board, player_who_submitted, dead);
	});
	
	// Fault handling
	socket.on("dead_fault", function(player_who_submitted)
	{
		if(++game.players_requesting_fault == 2)
		{
			var player_to_remove_from = player_who_submitted == 1 ? 2 : 1;
			var cards = game["p" + player_to_remove_from + "_cards"];
			var card_index_to_remove = Math.floor(Math.random()*cards.length);
			var card = game["p" + player_to_remove_from + "_cards"].splice(card_index_to_remove, 1)[0];
			game["p" + player_who_submitted + "_cards"].unshift(card);
			
			io.emit("remove_card_from_view", card, player_to_remove_from);
			io.emit("add_card_to_view", card, player_who_submitted);
		}
	});
	
	socket.on("correct_same_board", function(card, player_who_submitted)
	{
		if(++game.players_requesting_fault == 2)
		{
			var index_to_cut = 0;
			for(var i = 0; i < game["p" + player_who_submitted + "_cards"].length; i++)
			{
				if(game["p" + player_who_submitted + "_cards"][i] == card)
				{
					index_to_cut = i;
					break;
				}
			}
			
			io.emit("remove_card_from_view", game["p" + player_who_submitted + "_cards"].splice(index_to_cut, 1)[0], player_who_submitted);
		}
	});
	
	socket.on("correct_opposite_board", function(card, player_who_submitted)
	{
		if(++game.players_requesting_fault == 2)
		{
			var player_to_remove_from = player_who_submitted == 1 ? 2 : 1;
			var cards = game["p" + player_who_submitted + "_cards"];
			var card_index_to_remove = Math.floor(Math.random()*cards.length);
			var random_card = game["p" + player_who_submitted + "_cards"].splice(card_index_to_remove, 1)[0];
			game["p" + player_to_remove_from + "_cards"].unshift(random_card);
			
			for(var i = 0; i < game["p" + player_to_remove_from + "_cards"].length; i++)
			{
				if(game["p" + player_to_remove_from + "_cards"][i] == card)
					game["p" + player_to_remove_from + "_cards"].splice(i, 1);
			}
			
			io.emit("remove_card_from_view", random_card, player_who_submitted);
			io.emit("add_card_to_view", random_card, player_to_remove_from);
			io.emit("remove_card_from_view", card, player_to_remove_from);
		}
	});
	
	socket.on("wrong_opposite_board", function(card, player_who_submitted, player_with_correct_card)
	{
		if(++game.players_requesting_fault == 2)
		{
			// Player to remove a random card from
			var player_to_remove_from = player_who_submitted == 1 ? 2 : 1;
			var cards = game["p" + player_to_remove_from + "_cards"];
			var card_index_to_remove = Math.floor(Math.random()*cards.length);
			var random_card = game["p" + player_to_remove_from + "_cards"].splice(card_index_to_remove, 1)[0];
			
			// Add the card to the opponents side
			game["p" + player_who_submitted + "_cards"].unshift(random_card);
			
			// Remove the correct card from view.
			for(var i = 0; i < game["p" + player_with_correct_card + "_cards"].length; i++)
			{
				if(game["p" + player_with_correct_card + "_cards"][i] == card)
					game["p" + player_with_correct_card + "_cards"].splice(i, 1);
			}
			io.emit("remove_card_from_view", random_card, player_to_remove_from);
			io.emit("remove_card_from_view", card, player_with_correct_card);
			io.emit("add_card_to_view", random_card, player_who_submitted);
		}
	});
	
	socket.on("calculate_slot", function(cards, callback)
	{
		if(++game.players_requesting_slot_calc == 1)
		{
			var open_slots = [];
			for(var i = 0; i < cards.length; i++)
			{
				if(!cards[i])
					open_slots.unshift(i);
			}
			var slot = Math.floor(Math.random()*open_slots.length);
			game.next_slot_insert = open_slots[slot];
			callback(open_slots[slot]);
			
		}
		else
		{
			callback(game.next_slot_insert);
			game.next_slot_insert = -1;
			game.players_requesting_slot_calc = 0;
		}
	});
	
	socket.on("win_check", function(cb)
	{
		if(game.p1_cards.length == 0)
			cb(1, " running out of cards");
		else if(game.p2_cards.length == 0)
			cb(2, " running out of cards");
		else if(game.p1_cards.length == 36)
			cb(2, " acquiring 36 cards");
		else if(game.p2_cards.length == 36)
			cb(1, " acquiring 36 cards");
		else
			cb(-1, "continue");
	});
});

// Listen for connections on port 5000
http.listen(5000, function()
{
	
});

// Game functions
function getSample(arr, size)
{
	var shuffled = arr.slice(), i = arr.length, temp, index;
	while(i--)
	{
		index = Math.floor((i +1) * Math.random());
		temp = shuffled[index];
		shuffled[index] = shuffled[i];
		shuffled[i] = temp;
	}
	return shuffled.slice(0, size);
}

function getCards()
{
	var arr = [];
	for(var i = 0; i < 100; i++)
		arr[i] = i+1;
	
	var size = 100;
	
	var shuffled = arr.slice(), i = arr.length, temp, index;
	while(i--)
	{
		index = Math.floor((i +1) * Math.random());
		temp = shuffled[index];
		shuffled[index] = shuffled[i];
		shuffled[i] = temp;
	}
	
	game.p1_cards = shuffled.slice(0, 25);
	game.p2_cards = shuffled.slice(25, 50);
	game.reader_cards = getSample(shuffled, 100);
	
	var options = [];
	for(var i = 0; i < 36; i++)
		options[i] = i;
	
	var p1_occupied_slots = getSample(options, 25);
	var p2_occupied_slots = getSample(options, 25);
	p1_occupied_slots = p1_occupied_slots.sort(function(a, b){return a-b});
	p2_occupied_slots = p2_occupied_slots.sort(function(a, b){return a-b});
	
	var p1_final_slots = [];
	var p2_final_slots = [];
	var j = 0;
	var k = 0;
	for(var i = 0; i < 36; i++)
	{
		if(p1_occupied_slots[j] == i)
			p1_final_slots[i] = game.p1_cards[j++];
		else
			p1_final_slots[i] = null;
		
		if(p2_occupied_slots[k] == i)
			p2_final_slots[i] = game.p2_cards[k++];
		else
			p2_final_slots[i] = null;
	}
	
	game.p1_final_slots = p1_final_slots;
	game.p2_final_slots = p2_final_slots;
	
}