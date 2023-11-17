CREATE TABLE `Message` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `Queue` varchar(100) DEFAULT NULL,
  `Priority` int(11) DEFAULT NULL,
  `Created` datetime DEFAULT NULL,
  `CreatedBy` varchar(100) DEFAULT NULL,
  `Url` varchar(2000) DEFAULT NULL,
  `Verb` varchar(20) DEFAULT NULL,
  `Headers` text,
  `Params` mediumtext,
  `Delivery` datetime DEFAULT NULL,
  `Status` varchar(45) DEFAULT NULL,
  `Retries` int(11) DEFAULT NULL,
  `RetryCounter` int(11) DEFAULT '0',
  `Fails` int(11) DEFAULT NULL,
  `RetryInterval` int(11) DEFAULT NULL,
  `SendInterval` int(11) DEFAULT NULL,
  `Fail` varchar(100) DEFAULT NULL,
  `Success` varchar(100) DEFAULT NULL,
  `Updated` datetime DEFAULT NULL,
  `LastError` mediumtext,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `QueueInfo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) DEFAULT NULL,
  `Updated` datetime DEFAULT NULL,
  `WasUpdated` tinyint(4) DEFAULT '0',
  `SendInterval` tinyint(4) DEFAULT '1',
  `Retries` tinyint(4) DEFAULT '3',
  `RetryInterval` tinyint(4) DEFAULT '120',
  `ChunkCount` tinyint(4) DEFAULT '1',
  `Success` varchar(100) DEFAULT 'DELETE',
  `Fail` varchar(100) DEFAULT NULL,
  `Added` int(11) DEFAULT '0',
  `Succeeded` int(11) DEFAULT '0',
  `Failed` int(11) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name_UNIQUE` (`Name`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `Stats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `Key` varchar(100) DEFAULT NULL,
  `Figure` int(11) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_UNIQUE` (`Key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
