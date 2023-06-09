if (typeof web3 !== "undefined") {
  // Use the browser's ethereum provider
  var provider = web3.currentProvider;
  console.log(web3.currentProvider);
  var web3Instance = new Web3(web3.currentProvider);
} else {
  console.log("No web3? You should consider trying MetaMask!");
  // fallback
  //   var web3Instance = new Web3(
  //     new Web3.providers.HttpProvider("http://localhost:8545")
  //   );
}
