const gff = require("bionode-gff");
const fs = require("fs");

/**
 * Pass in file pathm it will calculate the average legnth of
 * first coded exon to last coded exon, and the average length
 * of gene
 * @param {*} file_name
 * @returns {Promise} a promise that contains the result
 */
function calculate_file(file_name) {
  let gene,
    total_counted_gene_length = 0,
    counted_genes = 0,
    first_to_last_exon_length_pieces = 0,
    total_coded_exon_length = 0,
    wrong_gene_counts = 0;

  // asynchrous event
  return new Promise(resolve => {
    // start reading file
    gff
      .read(file_name)
      // call this function when reading each line of file
      .on("data", onFeature)
      // call this funciton when finished
      .on("end", () => {
        done_reading_file();
        // return the result
        resolve({
          file_name: file_name,
          average_gene_length: total_counted_gene_length / counted_genes,
          average_exon_length:
            total_coded_exon_length / first_to_last_exon_length_pieces,
          total_exon: first_to_last_exon_length_pieces
        });
      });
  });

  /**
   * if record is a feature, combine exon and CDS and gene into gene obejct
   * @param {Feature} feature object
   */
  function onFeature(feature) {
    /* convert gene into js object and calculate based on object property
  / if record is gene load previous exon and CDS and other properties into
  / Gene object */
    if (feature.type === "gene") {
      if (gene) fetch_gene_info(gene);
      gene = feature;
      gene.start = feature.start;
      gene.end = feature.end;
      gene.exons = []; // push all exons to gene object
      gene.cdss = []; // push all CDS to gene object
    } else if (feature.type === "exon" && gene) {
      let exon = {};
      exon.start = feature.start;
      exon.end = feature.end;
      gene.exons.push(exon);
    } else if (feature.type === "CDS" && gene) {
      let cds = {};
      cds.start = feature.start;
      cds.end = feature.end;
      gene.cdss.push(cds);
    }
  }

  /**
   * this will manipulate the gene info
   * @param {gene} gene gene record
   */
  function fetch_gene_info(gene) {
    // get the last coded_exon_length
    const coded_exon_length = get_coded_exon_length_for_gene(gene);
    const gene_length = gene.end - gene.start;
    if (coded_exon_length > 0 && coded_exon_length <= gene_length) {
      counted_genes++;
      total_counted_gene_length += gene_length;
      total_coded_exon_length += coded_exon_length;
      first_to_last_exon_length_pieces++;
    }
    if (gene_length < coded_exon_length) wrong_gene_counts++;
  }
  // calculate the coded exon length
  // first_exon_start first_DSA first_exon_end
  // last_exon_start last_DSA last_exon_end
  function get_coded_exon_length_for_gene(gene) {
    // deep clone gene becasue I don't want mutate the original gene
    let g = Object.assign({}, gene);
    if (g.cdss.length === 0) return 0;
    let start = 0,
      end = 0;
    const firstCDS = g.cdss[0];
    const lastCDS = g.cdss[g.cdss.length - 1];
    // find first coded exon
    for (let i = 0; i < g.exons.length; i++) {
      const firstExon = g.exons[i];
      if (firstCDS.start >= firstExon.start && firstCDS.end <= firstExon.end) {
        start = firstExon.start;
        break;
      }
    }
    // find last coded exon
    for (let i = 0; i < g.exons.length; i++) {
      const lastExon = g.exons[g.exons.length - 1 - i];
      if (lastCDS.start >= lastExon.start && lastCDS.end <= lastExon.end) {
        end = lastExon.end;
        break;
      }
    }
    return Math.abs(end - start);
  }

  function done_reading_file() {
    fetch_gene_info(gene); // this is for last gene in file;
  }
}

/**
 * this function will calculate all mamal gff files
 */
async function calculate_all_files(directoryPath) {
  let result_arr = [];
  let files = fs.readdirSync(directoryPath);
  let result_files = [];
  // filter illegal files
  const pattern = /^GCF_[0-9]*.*/;
  files.forEach(function(f) {
    if (pattern.test(f)) result_files.push(directoryPath + "/" + f);
  });

  for (let i = 0, len = result_files.length; i < len; i++) {
    const f = result_files[i];
    console.log("calculating " + f + "(" + (i + 1) + "/" + len + ")");
    await calculate_file(f, "")
      .then(res => {
        result_arr.push([
          res.file_name,
          res.average_gene_length,
          res.average_exon_length
        ]);
      })
      .catch(err => console.log(err));
  }
  return result_arr;
}

async function initializedFileMap(directory_path, ouput_path) {
  var contents = fs.readFileSync("files_map.json");
  // Define to JSON type
  var files_map = JSON.parse(contents);
  // Get Value from JSON
  let res_arr = await calculate_all_files(directory_path);
  let res_str =
    "Organism Name, Average Gene Length," +
    "Average Length of First Coded Exon to Last Coded Exon\n";
  // join results
  for (let i = 0; i < res_arr.length; i++) {
    /** convert file path to assembly 
     eg: convert ./mamals/GCF_000001405.39_GRCh38.p13_genomic.gff
     to GCF_000001405.39
    */
    res_arr[i][0] =
      files_map["GCF_" + res_arr[i][0].split("/")[2].split("_")[1]];
    res_str = res_str + res_arr[i].join(",") + "\n";
  }
  // write to file
  fs.writeFile(ouput_path, res_str, err => {
    if (err) console.log(err);
    console.log("Successfully Written to File.");
  });
}

initializedFileMap(process.argv[2], process.argv[3]);
