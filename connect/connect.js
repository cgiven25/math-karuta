function username_accept(event)
{
	if(event.key == "Enter")
	{
		var text = document.getElementById("username");
		text.disabled = true;
		var username = text.value;
		
		var socket = io();
		socket.emit("player_enter", username == "" ? "Guest" : username, function(answer)
		{
			if(answer == "ok")
				window.location.replace("/game/karuta.html");
			else if(answer == "full")
			{
				document.getElementById("username_msg").innerHTML = "The room is currently full.";	
				setTimeout(function()
				{
					text.disabled = false;
					text.value = "";
					document.getElementById("username_msg").innerHTML = "Username";
				}, 2000);
			}
			else if(answer == "too long")
			{
				document.getElementById("username_msg").innerHTML = "TRY AGAIN.";
				setTimeout(function()
				{
					text.disabled = false;
					text.value = "";
					document.getElementById("username_msg").innerHTML = "Username";
				}, 2000);
			}
			else
			{
				// Someone in name already has same username
				document.getElementById("username_msg").innerHTML = "Username taken.";
				setTimeout(function()
				{
					text.disabled = false;
					text.value = "";
					document.getElementById("username_msg").innerHTML = "Username"
				}, 2000);
			}
		});
	}
}

window.onload = function()
{
	document.getElementById("username").addEventListener("keydown", username_accept);
}
