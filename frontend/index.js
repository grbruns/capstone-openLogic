'use strict';

const repositoryData = {
  'userProofs': [],
  'repoProofs': [],
  'completedUserProofs': []
}

let adminUsers = [];

/**
 * This function is called by the Google Sign-in Button
 * @param {*} googleUser 
 */
function onSignIn(googleUser) {
  console.log("onSignIn", googleUser);

  // This response will be cached after the first page load
  $.getJSON('/backend/admins', (admins) => {
    try {
      adminUsers = admins['Admins'];
    } catch(e) {
      console.error('Unable to load admin users', e);
    }

    new User(googleUser)
    .initializeDisplay()
    .loadProofs();
  });
}

/**
 * Class for functionality specific to user sign-in/authentication
 */
class User {
  /** Constructor is called from User.onSignIn - not intended for direct use. */
  constructor(googleUser) {
    this.profile = googleUser.getBasicProfile();
    this.domain = googleUser.getHostedDomain();
    this.email = this.profile.getEmail();
    this.name = this.profile.getName();

    if ( adminUsers.indexOf(this.email) > -1 ) {
      console.log('Logged in as an administrator.');
      this.showAdminFunctionality();
    }

    this.attachSignInChangeListener();
    return this;
  }

  initializeDisplay() {
    $('#user-email').text(this.email);
    $('#load-container').show();
    $('#nameyourproof').show();

    return this;
  }

  showAdminFunctionality() {
    $('#adminLink').show();

    return this;
  }

  loadProofs() {
    loadUserProofs();
    loadRepoProofs();
    loadUserCompletedProofs();

    return this;
  }

  attachSignInChangeListener() {
    gapi.auth2.getAuthInstance().isSignedIn.listen(this.signInChangeListener);

    return this;
  }

  signInChangeListener(loggedIn) {
    console.log('Sign in status changed', loggedIn);
    window.location.reload();
  }

  static isSignedIn() {
    return gapi.auth2.getAuthInstance().isSignedIn.get();
  }

  static isAdministrator() {
    return adminUsers.indexOf(gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail()) > -1;
  }

  // Check if the current time (in unix timestamp) is after the token's expiration
  static isTokenExpired() {
    return + new Date() > gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().expires_at;
  }

  // Retrieve the last cached token
  static getIdToken() {
    return gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token;
  }

  // Get a newly issued token (returns a promise)
  static refreshToken() {
    return gapi.auth2.getAuthInstance().currentUser.get().reloadAuthResponse();
  }
}

// Verifies signed in and valid token, then calls authenticatedBackendPOST
// Returns a promise which resolves to the response body or undefined
function backendPOST(path_str, data_obj) {
  if ( !User.isSignedIn() ) {
    console.error('Cannot send POST request to backend from unknown user.');
    if ( sessionStorage.getItem('loginPromptShown') == null ) {
      alert('You are not signed in.\nTo save your work, please sign in and then try again, or refresh the page.');
      sessionStorage.setItem('loginPromptShown', "true");
    }
    
    return;
  }

  if ( User.isTokenExpired() ) {
    console.warn('Token expired; attempting to refresh token.');
    return User.refreshToken().then( googleUser => authenticatedBackendPOST(path_str, data_obj, googleUser.id_token) );
  } else {
    return authenticatedBackendPOST(path_str, data_obj, User.getIdToken());
  }
}

// Send a POST request to the backend, with auth token included
function authenticatedBackendPOST(path_str, data_obj, id_token) {
  return $.ajax({
    url: '/backend/' + path_str,
    method: 'POST',
    data: JSON.stringify(data_obj),
    dataType: 'json',
    contentType: 'application/json; charset=utf-8',
    headers: {
      'X-Auth-Token': id_token
    }
  }).then(
    (data, textStatus, jqXHR) => {
      return data;
    },
    (jqXHR, textStatus, errorThrown) => {
      console.error(textStatus, errorThrown);
    }
  )
}

// For administrators only - backend requires valid admin token
function getCSV() {
  backendPOST('proofs', { selection: 'downloadrepo' }).then(
    (data) => {
      console.log("downloadRepo", data);

      if ( !Array.isArray(data) || data.length < 1 ) {
        console.error('No proofs received.');
        return;
      }

      let csv_header = Object.keys(data[0]).join(',') + '\n';

      let csv = data.reduce( (rows, proof) => {
        return rows + Object.values(proof).reduce( (accum, elem) => {
          if ( Array.isArray(elem) ) {
            return accum + ',"' + elem.join('|') + '"';
          }
          return accum + ',"' + elem + '"';
        }) + '\n';
      }, csv_header);

    let downloadLink = document.createElement('a');
    downloadLink.download = "Student_Problems.csv";
    downloadLink.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
    downloadLink.target = '_blank';
    downloadLink.click();
  });
}

const prepareSelect = (selector, options) => {
  let elem = document.querySelector(selector);

  // Remove all child nodes from the select element
  $(elem).empty();

  // Create placeholder option
  elem.appendChild(
    new Option('Select...', null, true, true)
  );

  // Set placeholder to disabled so it does not show as selectable
  elem.querySelector('option').setAttribute('disabled', 'disabled');

  // Add option elements for the options
  (options) && options.forEach( proof => {
    let option = new Option(proof.ProofName, proof.Id);
    elem.appendChild(option);
  });
}

// load user's incomplete proofs
function loadUserProofs() {
  backendPOST('proofs', { selection: 'user' }).then(
    (data) => {
      console.log("loadSelect", data);
      repositoryData.userProofs = data;

      prepareSelect('#userProofSelect', data);
      $('#userProofSelect').data('repositoryDataKey', 'userProofs')
    }
  );
}

// load repository problems
function loadRepoProofs() {
  backendPOST('proofs', { selection: 'repo' }).then(
    (data) => {
      console.log("loadRepoProofs", data);
      repositoryData.repoProofs = data;

      prepareSelect('#repoProofSelect', data);
      $('#repoProofSelect').data('repositoryDataKey', 'repoProofs');
    }
  );
}

// load user's completed proofs
function loadUserCompletedProofs() {
  backendPOST('proofs', { selection: 'completedrepo' }).then(
    (data) => {
      console.log("loadUserCompletedProofs", data);
      repositoryData.completedUserProofs = data;

      prepareSelect('#userCompletedProofSelect', data);
      $('#userCompletedProofSelect').data('repositoryDataKey', 'completedUserProofs')
    }
  );
}

$(document).ready(function() {
  // Store proof when check button is clicked
  $('.proofContainer').on('checkProofEvent', (event) => {
    console.log(event, event.detail, event.detail.proofdata);

    let proofData = event.detail.proofdata;

    let Premises = [].concat(proofData.filter( elem => elem.jstr == "Pr" ).map( elem => elem.wffstr ));
    let Logic = [],
        Rules = [];
    
    proofData.filter( elem => elem.jstr != "Pr" ).forEach(
      elem => {
          Logic.push(elem.wffstr);
          Rules.push(elem.jstr);
      }
    );

    let entryType = "proof"; // What is this meant to be used for?

    let proofName = $('.proofNameSpan').text() || "n/a";
    let repoProblem = $('#repoProblem').val() || "false";
    let proofType = predicateSettings ? "fol" : "prop";

    let proofCompleted = event.detail.proofCompleted;
    let conclusion = event.detail.wantedConc;

    let postData = new Proof(entryType, proofName, proofType, Premises, Logic, Rules, proofCompleted, conclusion, repoProblem);

    console.log('saving proof', postData);
    backendPOST('saveproof', postData).then( data => {
      console.log('proof saved', data);
      
      if ( postData.proofCompleted == "true" ) {
        loadUserCompletedProofs();
      } else {
        loadUserProofs();
      }
    })
  });

  // Admin users - publish problems to public repo
  $('.proofContainer').on('click', '#addToPublicRepoButton', (event) => {
    let proofName = $('.proofNameSpan').text();
    if ( !proofName || proofName == "" ) {
      proofName = prompt("Please enter a name for your proof:");
    }
    if ( !proofName ) {
      console.error('No proof name entered');
      return;
    }

    if ( !proofName.startsWith('Repository - ') ) {
      proofName = 'Repository - ' + proofName;
    }
    $('.proofNameSpan').text(proofName);
    $('#checkButton').click();
  });

  // Populate form when any of the select elements changes
  $('.proofSelect').change( (event) => {
    let selectedDataId = event.target.value;
    let selectedDataSetName = $(event.target).data('repositoryDataKey');
    let selectedDataSet = repositoryData[selectedDataSetName];

    // == means '3' is equal to 3
    let selectedProof = selectedDataSet.filter( proof => proof.Id == selectedDataId );

    if ( !selectedProof || selectedProof.length < 1 ) {
      console.error("Selected proof ID not found.");
      return;
    }

    // Set repoProblem if originally loaded from the repository select
    if ( selectedDataSetName == 'repoProofs' || selectedProof.repoProblem == "true" ) {
      $('#repoProblem').val('true');
    } else {
      $('#repoProblem').val('false');
    }

    selectedProof = selectedProof[0];

    console.log('selected proof', selectedProof);

    if ( Array.isArray(selectedProof.Logic) && Array.isArray(selectedProof.Rules) ) {
      $('.proofContainer').data({
        'Logic': selectedProof.Logic,
        'Rules': selectedProof.Rules
      });
    }

    // Add a small delay to show the user what is being done
    let delayTime = 200;
    $.when(
      $('#folradio').prop('checked', true),
      // Checking this radio button will uncheck the other radio button
      $('#tflradio').prop('checked', (selectedProof.ProofType == 'prop')),
      $('#proofName').delay(delayTime).val(selectedProof.ProofName),
      $('#probpremises').delay(delayTime).val( selectedProof.Premise.join(',') ),
      $('#probconc').delay(delayTime).val( selectedProof.Conclusion )
    ).then(
      function () {
        $('#createProb').click();
      }
    );
  });

  //creating a problem based on premise and conclusion
  $("#createProb").click( function() {
    // predicateSettings is a global var defined in syntax_upstream.js
    predicateSettings = (document.getElementById("folradio").checked);
    let premisesString = document.getElementById("probpremises").value;
    let conclusionString = document.getElementById("probconc").value;
    let proofName = document.getElementById('proofName').value;
    createProb(proofName, premisesString, conclusionString);
  });
  //end creating a problem based on premise and conclusion

  $('.newProof').click( event => {
    resetProofUI();

    // Reset 'repoProblem'
    $('#repoProblem').val('false');

    $('.createProof').slideDown();
    $('.proofContainer').slideUp();
  });

  $('#proofName').popup({ on: 'hover' });
  $('#repoProofSelect').popup({ on: 'hover' });
  $('#userCompletedProofSelect').popup({ on: 'hover' });

  // Admin modal
  $('#adminLink').click( (event) => {
    $('.ui.modal').modal('show');
  });

  $('.downloadCSV').click( () => getCSV() );
  // End admin modal
});

function resetProofUI() {
  $('#proofName').val(''); // Clear name
  $('#tflradio').prop('checked', true); // Set to Propositional
  $('#probpremises').val(''); // Clear premises
  $('#probconc').val(''); // Clear conclusion
  $('.proofNameSpan').text(''); // Clear proof name
  $('#theproof').empty(); // Remove all HTML from 'theproof' element

  // Reset all select boxes to "Select..." (the first option element)
  $('#load-container select option:nth-child(1)').prop('selected', true);

  // Remove Logic/Rules from proofContainer's data
  $('.proofContainer').removeData();
}

// predicateSettings = (document.getElementById("folradio").checked);
// var pstr = document.getElementById("probpremises").value;
// var conc = fixWffInputStr(document.getElementById("probconc").value);
function createProb(proofName, premisesString, conclusionString) {
  let pstr = premisesString.replace(/^[,;\s]*/,'');
  pstr = pstr.replace(/[,;\s]*$/,'');
  let prems = pstr.split(/[,;\s]*[,;][,;\s]*/);
  let sofar = [];
  for (let a=0; a<prems.length; a++) {
    if (prems[a] != '') {
      let w = parseIt(fixWffInputStr(prems[a]));
      if (!(w.isWellFormed)) {
        alert('Premise ' + (a+1) + ', ' + fixWffInputStr(prems[a]) + ', is not well formed.');
        return false;
        }
      if ((predicateSettings) && (!(w.allFreeVars.length == 0))) {
        alert('Premise ' + (a+1) + ' is not closed.');
        return false;
      }
      sofar.push({
        "wffstr": wffToString(w, false),
        "jstr": "Pr"
      });
    }
  }
  let conc = fixWffInputStr(conclusionString);
  var cw = parseIt(conc);
  if (!(cw.isWellFormed)) {
    alert('The conclusion ' + fixWffInputStr(conc) + ', is not well formed.');
    return false;
  }
  if ((predicateSettings) && (!(cw.allFreeVars.length == 0))) {
    alert('The conclusion is not closed.');
    return false;
  }

  let proofContainerData = $('.proofContainer').data();
  if ( proofContainerData.hasOwnProperty('Logic') && proofContainerData.hasOwnProperty('Rules') ) {
    if ( Array.isArray(proofContainerData.Logic) && Array.isArray(proofContainerData.Rules) ) {
      proofContainerData.Logic.forEach( (value, idx) => {
        let w = parseIt(fixWffInputStr(proofContainerData.Logic[idx]));
        sofar.push({
          wffstr: wffToString(w, false),
          jstr: proofContainerData.Rules[idx]
        })
      });
    } else {
      console.warn('Error/unexpected: Logic/Rules are not arrays', proofContainerData);
    }
  }

  $('.createProof').slideUp();
  resetProofUI();
  $('.proofContainer').show();
  $('.proofNameSpan').text(proofName);
  var probstr = '';
  for (var k=0; k<sofar.length; k++) {
    probstr += prettyStr(sofar[k].wffstr);
      if ((k+1) != sofar.length) {
      probstr += ', ';
    }
  }
  document.getElementById("proofdetails").innerHTML = "Construct a proof for the argument: " + probstr + " ∴ " +  wffToString(cw, true);
  var tp = document.getElementById("theproof");
  makeProof(tp, sofar, wffToString(cw, false));
  return true;
}