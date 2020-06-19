elements = {};
player_data = {};
last_dead = -1;
document.getElementById("music").play();
window.onload = function()
{
	window.addEventListener("keydown", volume_adjust);
	socket = io();
	
	socket.emit("config", function(answer)
	{		
		player_data.player = answer.player;
		player = answer.player;
		player_data.other_player = player_data.player == 1 ? 2 : 1;
		elements.your_nameplate = document.getElementById("p" + player_data.player + "_nameplate");
		elements.other_nameplate = document.getElementById("p" + player_data.other_player + "_nameplate");
		elements.status = document.getElementById("status");
		elements.memorization = document.getElementById("memorization");
	});
	
	// Attach handlers
	// Get the player 2 name.
	socket.on("get_names", function(p1_name, p2_name)
	{
		player_data.your_name = player_data.player == 2 ? p2_name : p1_name;
		player_data.other_name = player_data.player == 2 ? p1_name : p2_name;
		document.getElementById("p1_nameplate").innerHTML = p1_name;
		document.getElementById("p2_nameplate").innerHTML = p2_name;
	});
	
	// Ready handling
	socket.on("ready_up", function()
	{
		elements.status.innerHTML = "Both players are seated.";
		setTimeout(function()
		{
			elements.status.innerHTML += " Click your name to ready up.";
			document.getElementById("volume").style.display = "none";
			elements.your_nameplate.style.borderColor = "red";
			elements.other_nameplate.style.borderColor = "red";
			elements.your_nameplate.addEventListener("click", readyUp)
			
			socket.on("border_change", function(changed_player){document.getElementById("p" + changed_player + "_nameplate").style.borderColor = "green";});
		}, 2500);
	});
	
	// Game handlers
	socket.on("memorization_start", function(cards)
	{
		elements.status.innerHTML = "Both players have readied up.  Here are your cards.  You have 15 minutes of memorization time.";
		elements.your_nameplate.style.borderColor = "blue";
		elements.other_nameplate.style.borderColor = "red";
		elements.your_nameplate.removeEventListener("click", readyUp);
		elements.memorization.style.display = "inline-block";
		document.getElementById("memorization_end").addEventListener("click", function()
		{
			clearTimeout(memory_timeout);
			socket.emit("mem_skip", false);
			document.getElementById("memorization_end").disabled = true;
		});
		
		socket.on("update_votes", function(num_ready)
		{
			document.getElementById("mem_end_votes").innerHTML = "(Votes: " + num_ready + "/2)";
		});
		
		generateBoard(cards);
		
		memory_timeout = setTimeout(function()
		{
			socket.emit("mem_skip", true);
		}, 900000);
	});
	
	
	socket.on("game_start", function(answer)
	{
		if(answer == "ok")
		{
			setTimeout(function()
			{
				elements.memorization.style.display = "none";
				elements.status.innerHTML = "Memorization time is over.  The first question will be ready in 10 seconds.";
				clearTimeout(memory_timeout);
				setTimeout(function()
				{
					socket.emit("get_next_card");
				}, 10000);
				
			}, 1500);
		}
		
		// card_num: card clicked
		// board_containing_card: player whose board has the card clicked
		// correct: whether or not the card clicked is the correct onerror
		// correct_card: the value of the card that is correct
		// correct_board: player whose board has the correct card
		// dead: whether or not the card is a dead card (is not on either board)
		socket.on("card_submission", function(card_num, board_containing_card, correct, correct_card, correct_board, player_who_submitted, dead)
		{
			// Config and variables
			var keep_going = false;
			var card_element = get_card_element(card_num);
			var status_str = "";
			var actor = player_who_submitted == player_data.player ? player_data.your_name : player_data.other_name;
			var other_actor = player_who_submitted == player_data.player ? player_data.other_name : player_data.your_name;
			var action = board_containing_card == player_who_submitted ? " defends" : " attacks";
			
			// Stuff we do no matter what
			card_element.style.borderColor = player_who_submitted == player_data.player ? "blue" : "red";
			
			if(dead)
			{
				// Player who touches the card is sent a random card from the opponent
				status_str += actor + action + " the " + '"' + card_num + '" card.';
				status_str += '\nThe answer was "' + correct_card + '", but that is a dead card.';
				status_str += "\nSo, " + other_actor + " sends a random card from their board.";
				setTimeout(function()
				{
					socket.emit("dead_fault", player_who_submitted);
				}, 6000);
			}
			else
			{
				if(correct)
				{
					if(player_who_submitted == board_containing_card)
					{
						// Card is removed from the board
						status_str += actor + " sucessfully" + action + " the " + '"' + card_num + '" card.';
						status_str += "\nIt will be removed from their board.";
						setTimeout(function()
						{
							socket.emit("correct_same_board", correct_card, player_who_submitted);
						}, 6000);
					}
					else
					{
						// Card is removed and a random card is sent from the submitter's board
						status_str += actor + " successfully" + action + " the " + '"' + card_num + '" card.';
						status_str += "\nSince it is on " + other_actor + "'s board, " + actor + " will send a random card.";
						setTimeout(function()
						{
							socket.emit("correct_opposite_board", correct_card, player_who_submitted);
						}, 6000);
					}
				}
				else
				{
					if(board_containing_card == correct_board)
					{
						// Do nothing.
						keep_going = true;
					}
					else
					{
						// Player who touched the card gains a card from opponent
						// Correct card is also removed from the board
						status_str += actor + action + " the " + '"' + card_num + '"card.';
						status_str += "\n The correct card was '" + correct_card + "'.";
						status_str += "\nSince " + actor + action.substr(0, action.length - 1) + "ed the board opposite of the one holding the correct card, ";
						status_str += 'the "' + correct_card + '" card is removed, and ' + other_actor + " sends a card.";
						setTimeout(function()
						{
							socket.emit("wrong_opposite_board", correct_card, player_who_submitted, correct_board);
						}, 6000);
					}
				}
			}
			
			if(!keep_going)
			{
				removeListeners();
				elements.status.innerHTML = status_str;
				setTimeout(function()
				{
					socket.emit("win_check", function(player, reason)
					{
						if(reason != "continue")
						{
							var name = player_data.player == player ? player_data.your_name : player_data.other_name;
							var other_name = player_data.player == player ? player_data.other_name : player_data.your_name;
							elements.status.innerHTML = "Due to ";
							elements.status += reason.includes("too many") ? other_name : name;
							elements.status += reason + ", ";
							elements.status.innerHTML += name + " has won the game!\n";
						}
						else
						{
							elements.status.innerHTML = "The next question will be read in 3 seconds.";
							clear_borders();
							setTimeout(function()
							{
								socket.emit("get_next_card");
							}, 4000);
						}
					});
				}, 6050);
			}
		});
		
		socket.on("remove_card_from_view", function(card, player)
		{
			if(player == 1)
			{
				for(var i = 0; i < p1_slots.length; i++)
				{
					if(p1_slots[i] == card)
					{
						p1_card_elements[i].setAttribute("class", "blank_card");
						p1_slots[i] = null;
						break;
					}
				}
			}
			else
			{
				for(var i = 0; i < p2_slots.length; i++)
				{
					if(p2_slots[i] == card)
					{
						p2_card_elements[i].setAttribute("class", "blank_card");
						p2_slots[i] = null;
						break;
					}
				}
			}
		});
		
		socket.on("add_card_to_view", function(card, player)
		{
			socket.emit("calculate_slot", player == 1 ? p1_slots : p2_slots, function(index)
			{	
				if(player == 1)
				{
					p1_slots.splice(index, 1, card);
					p1_card_elements[index].setAttribute("class", "card");
					p1_card_elements[index].innerHTML = card;
					p1_slots[index] = card;
				}
				else
				{
					p2_slots.splice(index, 1, card)
					p2_card_elements[index].setAttribute("class", "card");
					p2_card_elements[index].innerHTML = card;
					p2_slots[index] = card;
				}
			});
		});
	
		socket.on("next_card_delivery", function(card_content)
		{
			// Setup stuff
			question = card_content[0];
			correct_card = card_content[1];
			dead_card = card_content[2];
			
			for(var i = 0; i < p1_card_elements.length; i++)
			{
				if(p1_slots[i])
					p1_card_elements[i].addEventListener("click", submit_card);
					
				if(p2_slots[i])
					p2_card_elements[i].addEventListener("click", submit_card);
			}
			
			// Actually ask the question
			elements.status.innerHTML = question;
			if(!dead_card)
			{
				setTimeout(function()
				{
					if(elements.status.innerHTML == question)
						elements.status.innerHTML += " (answer: " + correct_card + ")";
				}, 9000);
			}
			else
			{
				setTimeout(function()
				{
					if(elements.status.innerHTML == question)
					{
						elements.status.innerHTML += " (answer: " + correct_card + ")";
						setTimeout(function()
						{
							if(elements.status.innerHTML.includes(question))
							{
								elements.status.innerHTML = "The answer was " + '"' + correct_card + '".  It was a dead card, and no faults were incurred by either player.';
								elements.status.innerHTML += "\nThe next card will be read in five seconds.";
								removeListeners();
								setTimeout(function()
								{
									socket.emit("get_next_card");
								}, 6000);
							}
						}, 4000);
					}
				}, 9000);
			}
		});
		
	});

	socket.emit("ready_to_collect_data");
}

function clear_borders()
{	
	for(var i = 0; i < p1_card_elements.length; i++)
	{
		if(p1_slots[i])
			p1_card_elements[i].style.borderColor = "green";
		
		if(p2_slots[i])
			p2_card_elements[i].style.borderColor = "green";
	}
}

function get_card_element(num)
{
	for(var i = 0; i < p1_card_elements.length; i++)
	{
		if(p1_card_elements[i].innerHTML == num)
			return p1_card_elements[i];
	}
	for(var i = 0; i < p2_card_elements.length; i++)
	{
		if(p2_card_elements[i].innerHTML == num)
			return p2_card_elements[i];
	}
}

function removeListeners()
{
	for(var i = 0; i < p1_card_elements.length; i++)
	{
		if(p1_slots[i])
			p1_card_elements[i].removeEventListener("click", submit_card);
		
		if(p2_slots[i])
			p2_card_elements[i].removeEventListener("click", submit_card);
	}
}

function clear_borders()
{
	for(var i = 0; i < p1_card_elements.length; i++)
	{
		if(p1_slots[i])
			p1_card_elements[i].style.borderColor = "green";
		
		if(p2_slots[i])
			p2_card_elements[i].style.borderColor = "green";
	}
}

function submit_card(event)
{
	socket.emit("submit_card", event.target.innerHTML, player_data.player);
}

function game_start()
{
	socket.emit("game_start");
}

/* ------------- Helper Functions ------------- */
function generateBoard(cards)
{
	p1_slots = cards[0];
	p2_slots = cards[1];
	
	p1_card_elements = [];
	p2_card_elements = [];
	
	// Create the elements for the cards
	for(var i = 0; i < 36; i++)
	{
		var p1_parent = document.getElementById("p1_board_row_" + (Math.floor(i/12) + 1));
		var p2_parent = document.getElementById("p2_board_row_" + (Math.floor(i/12) + 1));
		
		// This slot is occupied
		if(p1_slots[i])
		{
			var card = document.createElement("button");
			card.setAttribute("class", "card");
			card.innerHTML = p1_slots[i];
			p1_parent.appendChild(card);
			p1_card_elements[i] = card;
		}
		// This slot is unoccupied
		else
		{
			var spot = document.createElement("button");
			spot.setAttribute("class", "blank_card");
			p1_parent.appendChild(spot);
			p1_card_elements[i] = spot;
		}
		
		if(p2_slots[i])
		{
			var card = document.createElement("button");
			card.setAttribute("class", "card");
			card.innerHTML = p2_slots[i];
			p2_parent.appendChild(card);
			p2_card_elements[i] = card;
		}
		else
		{
			var spot = document.createElement("button");
			spot.setAttribute("class", "blank_card");
			p2_parent.appendChild(spot);
			p2_card_elements[i] = spot;
		}
	}
}

function readyUp()
{
	socket.emit("p" + player + "_ready");
}

function volume_adjust(event)
{
	var current_volume = document.getElementById("music").volume;
	if(event.key == "ArrowDown")
		document.getElementById("music").volume = current_volume - .05 < 0 ? 0 : current_volume - .05;
	else if(event.key == "ArrowUp")
		document.getElementById("music").volume = current_volume + .05 > 1 ? 1 : current_volume + .05;
	else if(event.key == "m")
		document.getElementById("music").volume = 0;
}
